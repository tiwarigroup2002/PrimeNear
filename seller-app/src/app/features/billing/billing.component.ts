import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, switchMap, of, catchError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { MOBILE_PATTERN } from '../../shared/validators/patterns';
import { InrPipe, PageHeaderComponent, SheetComponent } from '../../shared';

interface Line { productId: string; variantId?: string; variantLabel?: string; name: string; price: number; gstAmount: number; finalPrice: number; gstRate: number; stock: number; quantity: number; image?: string }

const DRAFT_KEY = 'pn_bill_draft';

@Component({
  selector: 'app-billing',
  imports: [FormsModule, InrPipe, PageHeaderComponent, SheetComponent],
  templateUrl: './billing.component.html',
})
export class BillingComponent implements OnInit {
  @ViewChild('search') searchEl?: ElementRef<HTMLInputElement>;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  q = '';
  results = signal<any[]>([]);
  searching = signal(false);
  private search$ = new Subject<string>();

  lines = signal<Line[]>([]);
  customer = signal<any | null>(null);
  walkInName = '';
  walkInMobile = '';
  paymentMethod: 'Cash' | 'Online' = 'Cash';
  discount: number | null = null;
  deliveryCharge: number | null = null;
  notes = '';
  saving = signal(false);

  customerOpen = signal(false);
  cq = '';
  customers = signal<any[]>([]);
  newCustomer = { mobileNumber: '', name: '' };
  addingCustomer = signal(false);

  items = computed(() => this.lines().reduce((s, l) => s + l.quantity, 0));
  subtotal = computed(() => this.round(this.lines().reduce((s, l) => s + l.price * l.quantity, 0)));
  gst = computed(() => this.round(this.lines().reduce((s, l) => s + l.gstAmount * l.quantity, 0)));
  gross = computed(() => this.round(this.subtotal() + this.gst()));

  round(n: number) {
    return Math.round(n * 100) / 100;
  }

  get total() {
    return this.round(Math.max(0, this.gross() - (Number(this.discount) || 0) + (Number(this.deliveryCharge) || 0)));
  }

  ngOnInit() {
    this.search$
      .pipe(
        debounceTime(200),
        switchMap((q) => {
          this.searching.set(true);
          return this.api.get<any[]>('/products/search', { q }).pipe(catchError(() => of([])));
        })
      )
      .subscribe((r) => {
        this.results.set(r);
        this.searching.set(false);
      });
    this.search$.next('');
    this.restoreDraft();
  }

  onType() {
    this.search$.next(this.q);
  }

  /** Enter in the search box: exact SKU/barcode match (scanner) or the only result is added. */
  onEnter() {
    const q = this.q.trim();
    if (!q) return;
    this.api.get<any[]>('/products/search', { q }).subscribe((r) => {
      const exact = r.find((p) => p.sku?.toLowerCase() === q.toLowerCase() || p.barcode === q);
      const pick = exact || (r.length === 1 ? r[0] : null);
      if (pick) {
        this.add(pick);
        this.q = '';
        this.search$.next('');
      } else if (!r.length) this.toast.warning(`No product found for "${q}"`);
      else this.results.set(r);
    });
  }

  /** Product with colours / sizes waiting for the seller to pick one */
  variantPick = signal<any>(null);

  variantLabel(v: any) {
    return [v.color, v.size].filter(Boolean).join(' / ');
  }

  key(l: Line) {
    return l.productId + (l.variantId || '');
  }

  add(p: any) {
    const variants = (p.variants || []).filter((v: any) => v.isActive !== false);
    if (variants.length) {
      this.variantPick.set({ ...p, variants });
      return;
    }
    this.addUnit(p, null);
  }

  /** Adds one unit of a product, or of one colour / size of it. */
  addUnit(p: any, v: any) {
    const stock = v ? v.stock : p.stock;
    const name = v ? `${p.name} (${this.variantLabel(v)})` : p.name;
    if (stock <= 0) return this.toast.warning(`${name} is out of stock`);
    const lines = [...this.lines()];
    const existing = lines.find((l) => l.productId === p._id && (l.variantId || null) === (v?._id || null));
    if (existing) {
      if (existing.quantity >= stock) return this.toast.warning(`Only ${stock} in stock`);
      existing.quantity += 1;
    } else {
      const unit = v || p;
      lines.unshift({ productId: p._id, variantId: v?._id, variantLabel: v ? this.variantLabel(v) : undefined, name: p.name, price: unit.sellingPrice, gstAmount: unit.gstAmount, finalPrice: unit.finalPrice, gstRate: p.gstRate, stock, quantity: 1, image: v?.images?.[0] || p.images?.[0] });
    }
    this.lines.set(lines);
    this.variantPick.set(null);
    this.saveDraft();
    setTimeout(() => this.searchEl?.nativeElement.focus());
  }

  setQty(l: Line, qty: number) {
    qty = Math.floor(Number(qty) || 0);
    if (qty > l.stock) {
      this.toast.warning(`Only ${l.stock} in stock`);
      qty = l.stock;
    }
    if (qty <= 0) return this.remove(l);
    this.lines.set(this.lines().map((x) => (this.key(x) === this.key(l) ? { ...x, quantity: qty } : x)));
    this.saveDraft();
  }

  remove(l: Line) {
    this.lines.set(this.lines().filter((x) => this.key(x) !== this.key(l)));
    this.saveDraft();
  }

  async clear() {
    if (this.lines().length && !(await this.confirm.confirm('Clear bill?', 'All items will be removed.', 'warning', 'Clear'))) return;
    this.lines.set([]);
    this.customer.set(null);
    this.discount = null;
    this.notes = '';
    localStorage.removeItem(DRAFT_KEY);
  }

  // ---- Customer ----
  openCustomer() {
    this.cq = '';
    this.newCustomer = { mobileNumber: '', name: '' };
    this.findCustomers();
    this.customerOpen.set(true);
  }

  findCustomers() {
    this.api.get<any[]>('/customers/search', { q: this.cq }).subscribe((r) => this.customers.set(r));
  }

  pickCustomer(c: any) {
    this.customer.set(c);
    this.customerOpen.set(false);
    this.saveDraft();
  }

  createCustomer() {
    const m = this.newCustomer.mobileNumber.replace(/\D/g, '').slice(-10);
    if (!MOBILE_PATTERN.test(m)) return this.toast.warning('Enter a valid mobile number');
    this.addingCustomer.set(true);
    this.api.post<any>('/customers', { mobileNumber: m, name: this.newCustomer.name }).subscribe({
      next: (r) => { this.addingCustomer.set(false); this.toast.success('Customer added'); this.pickCustomer(r.data); },
      error: (e) => { this.addingCustomer.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  // ---- Save ----
  create() {
    if (!this.lines().length) return this.toast.warning('Add at least one product');
    const disc = Number(this.discount) || 0;
    if (disc < 0 || disc > this.gross()) return this.toast.warning('Discount is more than the bill amount');
    const walkInMobile = this.walkInMobile.replace(/\D/g, '');
    if (walkInMobile && !MOBILE_PATTERN.test(walkInMobile)) return this.toast.warning('Invalid mobile number');
    this.saving.set(true);
    this.api
      .post<any>('/invoices', {
        customerId: this.customer()?._id || null,
        walkInName: this.customer() ? '' : this.walkInName,
        walkInMobile: this.customer() ? '' : walkInMobile,
        items: this.lines().map((l) => ({ productId: l.productId, variantId: l.variantId || undefined, quantity: l.quantity })),
        paymentMethod: this.paymentMethod,
        discount: disc,
        deliveryCharge: Number(this.deliveryCharge) || 0,
        notes: this.notes,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          localStorage.removeItem(DRAFT_KEY);
          this.toast.success(r.message || 'Bill created');
          this.router.navigate(['/invoices', r.data.invoiceId], { queryParams: { new: 1 } });
        },
        error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
      });
  }

  // Keep the bill if the page is closed by mistake
  private saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines: this.lines(), customer: this.customer() }));
    } catch {}
  }

  private restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d?.lines?.length) {
        this.lines.set(d.lines);
        this.toast.info('Unsaved bill restored');
      }
      // "New bill for this customer" stores only the customer
      if (d?.customer) this.customer.set(d.customer);
    } catch {}
  }
}
