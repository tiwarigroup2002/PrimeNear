import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { PaymentService } from '../../core/services/payment.service';
import { ToastService } from '../../core/services/toast.service';
import { Address, CartData } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { AddressFormComponent, InrPipe, PageHeaderComponent, SheetComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-checkout',
  imports: [FormsModule, RouterLink, InrPipe, PageHeaderComponent, SheetComponent, StateComponent, AddressFormComponent],
  template: `
    <app-page-header title="Checkout" back="/cart" backLabel="Cart" />
    <app-state [loading]="loading()" [error]="error()" />
    @if (c(); as c) {
      <div class="row g-3">
        <div class="col-lg-7">
          <div class="card mb-3"><div class="card-body">
            <h2 class="h6 fw-semibold mb-2">1. How do you want it?</h2>
            <div class="d-grid gap-2">
              <button class="option-card" [class.active]="deliveryType() === 'Delivery'" [class.disabled]="!c.options?.delivery" [disabled]="!c.options?.delivery" (click)="setType('Delivery')">
                <i class="bi bi-truck big"></i>
                <span><span class="fw-semibold d-block">Home delivery</span><small class="text-muted">@if (c.options?.delivery) { {{ c.options!.deliveryCharge ? (c.options!.deliveryCharge | inr: 0) + ' delivery charge' : 'Free delivery' }}@if (c.options!.freeDeliveryAbove && c.options!.deliveryCharge) { · free above {{ c.options!.freeDeliveryAbove | inr: 0 }} } } @else { This shop does not deliver }</small></span>
              </button>
              <button class="option-card" [class.active]="deliveryType() === 'Pickup'" (click)="setType('Pickup')">
                <i class="bi bi-shop-window big"></i>
                <span><span class="fw-semibold d-block">Pick up from store</span><small class="text-muted">Collect from {{ c.shopName }} · no delivery charge</small></span>
              </button>
            </div>
          </div></div>

          @if (deliveryType() === 'Delivery') {
            <div class="card mb-3"><div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h2 class="h6 fw-semibold mb-0">2. Delivery address</h2>
                <button class="btn btn-sm btn-link" (click)="editing.set(null); addrOpen.set(true)"><i class="bi bi-plus-lg"></i> Add new</button>
              </div>
              @for (a of addresses(); track a._id) {
                <button class="option-card mb-2" [class.active]="addressId() === a._id" (click)="addressId.set(a._id)">
                  <i class="bi big" [class.bi-house]="a.type === 'Home'" [class.bi-briefcase]="a.type === 'Work'" [class.bi-geo-alt]="a.type === 'Other'"></i>
                  <span class="flex-grow-1 min-w-0">
                    <span class="fw-semibold">{{ a.name || a.type }}</span> <span class="badge bg-secondary-subtle text-secondary-emphasis">{{ a.type }}</span>
                    <small class="d-block text-muted">{{ a.fullAddress }}@if (a.city) {, {{ a.city }} }@if (a.zipCode) { - {{ a.zipCode }} }</small>
                    @if (a.phoneNumber) { <small class="d-block text-muted"><i class="bi bi-telephone"></i> {{ a.phoneNumber }}</small> }
                  </span>
                </button>
              }
              @if (!addresses().length) { <div class="text-muted small">No saved address. <a href="" (click)="$event.preventDefault(); addrOpen.set(true)">Add one</a> to get home delivery.</div> }
            </div></div>
          }

          <div class="card mb-3"><div class="card-body">
            <h2 class="h6 fw-semibold mb-2">{{ deliveryType() === 'Delivery' ? 3 : 2 }}. Payment</h2>
            <div class="d-grid gap-2">
              <button class="option-card" [class.active]="method() === 'Online'" [class.disabled]="!c.options?.online" [disabled]="!c.options?.online" (click)="method.set('Online')">
                <i class="bi bi-phone big"></i>
                <span><span class="fw-semibold d-block">Pay online</span><small class="text-muted">@if (c.options?.online) { UPI, cards, net banking, wallets (Razorpay) } @else { Not available right now }</small></span>
              </button>
              <button class="option-card" [class.active]="method() === 'Cash'" [class.disabled]="!c.options?.cod" [disabled]="!c.options?.cod" (click)="method.set('Cash')">
                <i class="bi bi-cash-stack big"></i>
                <span><span class="fw-semibold d-block">{{ deliveryType() === 'Pickup' ? 'Pay at store' : 'Cash on delivery' }}</span><small class="text-muted">@if (c.options?.cod) { Pay cash or UPI to the shopkeeper } @else { Not available for this shop }</small></span>
              </button>
            </div>
            <label class="form-label mt-3" for="notes">Note for the shop (optional)</label>
            <textarea id="notes" class="form-control" rows="2" maxlength="500" [(ngModel)]="notes" placeholder="e.g. deliver after 5 pm"></textarea>
          </div></div>
        </div>

        <div class="col-lg-5">
          <div class="card"><div class="card-body">
            <h2 class="h6 fw-semibold">Order summary · {{ c.shopName }}</h2>
            @for (l of c.items; track l.productId) {
              <div class="d-flex justify-content-between small py-1 gap-2"><span class="text-truncate">{{ l.quantity }} × {{ l.name }}</span><span class="flex-shrink-0">{{ l.lineTotal | inr }}</span></div>
            }
            <hr class="my-2" />
            <div class="summary-row small"><span>Items total</span><span>{{ c.totals.subtotal | inr }}</span></div>
            <div class="summary-row small"><span>GST</span><span>{{ c.totals.gst | inr }}</span></div>
            <div class="summary-row small"><span>Delivery</span><span>{{ c.totals.deliveryCharge ? (c.totals.deliveryCharge | inr) : 'FREE' }}</span></div>
            <div class="summary-row summary-total"><span>To pay</span><span>{{ c.totals.total | inr }}</span></div>
            @if (c.totals.savings) { <div class="text-success small fw-semibold mt-2">You save {{ c.totals.savings | inr }}</div> }
          </div></div>
          @if (!c.canCheckout) { <div class="alert alert-warning small mt-2 py-2">Some items are unavailable. <a routerLink="/cart">Review cart</a></div> }
          <div class="checkout-bar">
            <div class="d-lg-none"><div class="fw-bold">{{ c.totals.total | inr }}</div><small class="text-muted">To pay</small></div>
            <button class="btn btn-primary btn-lg flex-grow-1" [disabled]="!canPlace() || placing()" (click)="place()">
              @if (placing()) { <span class="spinner-border spinner-border-sm me-2"></span> }{{ method() === 'Online' ? 'Pay ' : 'Place order · ' }}{{ c.totals.total | inr }}
            </button>
          </div>
          <div class="checkout-spacer"></div>
        </div>
      </div>
    }

    <app-sheet [open]="addrOpen()" title="Add delivery address" (closed)="addrOpen.set(false)">
      <app-address-form [address]="editing()" (saved)="addressSaved($event)" />
    </app-sheet>
  `,
})
export class CheckoutComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private cart = inject(CartService);
  private payment = inject(PaymentService);
  private toast = inject(ToastService);
  private router = inject(Router);

  c = signal<CartData | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  deliveryType = signal<'Delivery' | 'Pickup'>('Delivery');
  method = signal<'Online' | 'Cash' | null>(null);
  addresses = signal<Address[]>([]);
  addressId = signal<string | null>(null);
  addrOpen = signal(false);
  editing = signal<Address | null>(null);
  placing = signal(false);
  notes = '';

  canPlace = computed(() => {
    const c = this.c();
    if (!c?.canCheckout || !this.method()) return false;
    return this.deliveryType() === 'Pickup' || !!this.addressId();
  });

  ngOnInit() {
    this.api.get<Address[]>('/addresses').subscribe({
      next: (a) => { this.addresses.set(a); this.addressId.set(a.find((x) => x.isDefault)?._id ?? a[0]?._id ?? null); },
      error: () => {},
    });
    this.loadCart(true);
  }

  loadCart(first = false) {
    this.cart.load(this.deliveryType()).subscribe({
      next: (c) => {
        if (first) {
          if (!c.items.length) return void this.router.navigate(['/cart']);
          if (!c.options?.delivery) this.deliveryType.set('Pickup');
          this.method.set(c.options?.online ? 'Online' : c.options?.cod ? 'Cash' : null);
          if (!c.options?.delivery) return this.loadCart();
        }
        this.c.set(c);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  setType(t: 'Delivery' | 'Pickup') {
    if (t === this.deliveryType()) return;
    this.deliveryType.set(t);
    this.loadCart();
  }

  addressSaved(a: Address) {
    this.addrOpen.set(false);
    this.addresses.set([...this.addresses().filter((x) => x._id !== a._id).map((x) => (a.isDefault ? { ...x, isDefault: false } : x)), a]);
    this.addressId.set(a._id);
  }

  place() {
    if (!this.canPlace()) return;
    this.placing.set(true);
    const body = { deliveryType: this.deliveryType(), addressId: this.deliveryType() === 'Delivery' ? this.addressId() : undefined, paymentMethod: this.method(), notes: this.notes || undefined };
    this.api.post<any>('/orders/create', body).subscribe({
      next: async (r) => {
        const order = r.data.order;
        this.cart.reset(0);
        if (order.paymentMethod === 'Cash') {
          this.placing.set(false);
          return this.router.navigate(['/order-success', order._id]);
        }
        let result: string;
        try {
          result = await this.payment.pay(order, r.data.payment);
        } catch (e: any) {
          result = 'dismissed';
          this.toast.error(e?.message || 'Could not open payment');
        }
        this.placing.set(false);
        if (result === 'paid') return this.router.navigate(['/order-success', order._id]);
        if (result === 'failed') {
          this.toast.error('Payment failed. No money was taken for this order.');
          return this.router.navigate(['/orders', order._id]);
        }
        this.toast.warning('Payment not completed. You can pay from the order page within 30 minutes.');
        return this.router.navigate(['/orders', order._id]);
      },
      error: (e) => {
        this.placing.set(false);
        this.toast.error(errorMessage(e));
        this.loadCart();
      },
    });
  }
}
