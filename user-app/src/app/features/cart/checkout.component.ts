import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
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
    <app-page-header title="Complete Your Order" back="/cart" backLabel="Back to Cart" />
    <app-state [loading]="loading()" [error]="error()" />
    @if (c(); as c) {
      <div class="row g-3 g-lg-4">
        <div class="col-lg-7">
          <!-- Step 1: Delivery Mode -->
          <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
            <div class="card-header bg-white py-3 border-bottom d-flex align-items-center gap-2">
              <span class="badge rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center" style="width: 26px; height: 26px; font-size: 0.8rem;">1</span>
              <h2 class="h6 fw-bold mb-0">Delivery Method</h2>
            </div>
            <div class="card-body p-3">
              <div class="d-grid gap-2">
                <button class="option-card" [class.active]="deliveryType() === 'Delivery'" [class.disabled]="!c.options?.delivery" [disabled]="!c.options?.delivery" (click)="setType('Delivery')">
                  <div class="option-icon-box bg-primary-subtle text-primary">
                    <i class="bi bi-truck fs-4"></i>
                  </div>
                  <div class="flex-grow-1 text-start">
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="fw-bold text-dark">Home Delivery</span>
                      @if (deliveryType() === 'Delivery') { <i class="bi bi-check-circle-fill text-primary fs-5"></i> }
                    </div>
                    <small class="text-muted d-block mt-1">
                      @if (c.options?.delivery) {
                        {{ c.options!.deliveryCharge ? (c.options!.deliveryCharge | inr: 0) + ' delivery fee' : 'FREE delivery' }}
                        @if (c.options!.freeDeliveryAbove && c.options!.deliveryCharge) { · free above {{ c.options!.freeDeliveryAbove | inr: 0 }} }
                      } @else {
                        This store currently does not offer home delivery
                      }
                    </small>
                  </div>
                </button>

                <button class="option-card" [class.active]="deliveryType() === 'Pickup'" (click)="setType('Pickup')">
                  <div class="option-icon-box bg-success-subtle text-success">
                    <i class="bi bi-shop-window fs-4"></i>
                  </div>
                  <div class="flex-grow-1 text-start">
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="fw-bold text-dark">Store Pickup</span>
                      @if (deliveryType() === 'Pickup') { <i class="bi bi-check-circle-fill text-primary fs-5"></i> }
                    </div>
                    <small class="text-muted d-block mt-1">Collect directly from {{ c.shopName }} · Zero delivery charge</small>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 2: Delivery Address -->
          @if (deliveryType() === 'Delivery') {
            <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
              <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center" style="width: 26px; height: 26px; font-size: 0.8rem;">2</span>
                  <h2 class="h6 fw-bold mb-0">Delivery Address</h2>
                </div>
                <button class="btn btn-sm btn-outline-primary rounded-pill px-3 shadow-xs" (click)="editing.set(null); addrOpen.set(true)">
                  <i class="bi bi-plus-lg me-1"></i>Add New
                </button>
              </div>
              <div class="card-body p-3">
                @for (a of addresses(); track a._id) {
                  <button class="option-card mb-2" [class.active]="addressId() === a._id" (click)="addressId.set(a._id)">
                    <div class="option-icon-box bg-light text-secondary">
                      <i class="bi fs-5" [class.bi-house-door-fill]="a.type === 'Home'" [class.bi-briefcase-fill]="a.type === 'Work'" [class.bi-geo-alt-fill]="a.type === 'Other'"></i>
                    </div>
                    <span class="flex-grow-1 min-w-0 text-start">
                      <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold text-dark">{{ a.name || a.type }}</span>
                        <span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill">{{ a.type }}</span>
                        @if (addressId() === a._id) { <i class="bi bi-check-circle-fill text-primary fs-5 ms-auto"></i> }
                      </div>
                      <small class="d-block text-muted mt-1">{{ line(a) }}</small>
                      @if (a.phoneNumber) { <small class="d-block text-muted mt-1"><i class="bi bi-telephone me-1"></i>{{ a.phoneNumber }}</small> }
                    </span>
                  </button>
                }
                @if (!addresses().length) {
                  <div class="text-center py-3 bg-light rounded-3">
                    <p class="text-muted small mb-2">No saved addresses found.</p>
                    <button class="btn btn-sm btn-primary rounded-pill" (click)="addrOpen.set(true)">Add an address</button>
                  </div>
                }
                <div class="d-flex align-items-center gap-1 small text-muted mt-2">
                  <i class="bi bi-info-circle"></i>
                  <span>The store delivers to PIN codes within its designated local coverage area.</span>
                </div>
                @if (addressId()) {
                  @if (areaCheck() === null) {
                    <div class="small text-muted mt-2 d-flex align-items-center gap-2">
                      <span class="spinner-border spinner-border-sm text-primary"></span>
                      <span>Verifying delivery coverage...</span>
                    </div>
                  } @else if (areaCheck()!.deliverable) {
                    <div class="alert alert-success py-2 mt-2 mb-0 rounded-3 small d-flex align-items-center gap-2">
                      <i class="bi bi-check-circle-fill fs-5"></i>
                      <span>{{ areaCheck()!.message }}</span>
                    </div>
                  } @else {
                    <div class="alert alert-warning py-2 mt-2 mb-0 rounded-3 small d-flex align-items-center gap-2">
                      <i class="bi bi-geo-alt-fill fs-5"></i>
                      <span>{{ areaCheck()!.message }}</span>
                    </div>
                  }
                }
              </div>
            </div>
          }

          <!-- Step 3: Billing Address -->
          <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center gap-2">
                <span class="badge rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center" style="width: 26px; height: 26px; font-size: 0.8rem;">{{ deliveryType() === 'Delivery' ? 3 : 2 }}</span>
                <h2 class="h6 fw-bold mb-0">Billing Address</h2>
              </div>
              <button class="btn btn-sm btn-outline-primary rounded-pill px-3 shadow-xs" (click)="editing.set(null); addrOpen.set(true)">
                <i class="bi bi-plus-lg me-1"></i>Add New
              </button>
            </div>
            <div class="card-body p-3">
              @if (deliveryType() === 'Delivery') {
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="sameBill" [checked]="sameBilling()" (change)="sameBilling.set($any($event.target).checked)" />
                  <label class="form-check-label fw-semibold small" for="sameBill">Same as delivery address</label>
                </div>
              }
              @if (deliveryType() === 'Pickup' || !sameBilling()) {
                @for (a of addresses(); track a._id) {
                  <button class="option-card mb-2" [class.active]="billingId() === a._id" (click)="billingId.set(a._id)">
                    <div class="option-icon-box bg-light text-secondary">
                      <i class="bi bi-receipt fs-5"></i>
                    </div>
                    <span class="flex-grow-1 min-w-0 text-start">
                      <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold text-dark">{{ a.name || a.type }}</span>
                        <span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill">{{ a.type }}</span>
                        @if (billingId() === a._id) { <i class="bi bi-check-circle-fill text-primary fs-5 ms-auto"></i> }
                      </div>
                      <small class="d-block text-muted mt-1">{{ line(a) }}</small>
                      @if (!a.zipCode) { <small class="d-block text-danger mt-1">Valid PIN code required for invoice</small> }
                    </span>
                  </button>
                }
              }
              <small class="d-block text-muted">This address will be printed on your official tax invoice.</small>
            </div>
          </div>

          <!-- Step 4: Payment Method -->
          <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
            <div class="card-header bg-white py-3 border-bottom d-flex align-items-center gap-2">
              <span class="badge rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center" style="width: 26px; height: 26px; font-size: 0.8rem;">{{ deliveryType() === 'Delivery' ? 4 : 3 }}</span>
              <h2 class="h6 fw-bold mb-0">Payment Options</h2>
            </div>
            <div class="card-body p-3">
              <div class="d-grid gap-2">
                <button class="option-card" [class.active]="method() === 'Online'" [class.disabled]="!c.options?.online" [disabled]="!c.options?.online" (click)="method.set('Online')">
                  <div class="option-icon-box bg-primary-subtle text-primary">
                    <i class="bi bi-shield-check fs-4"></i>
                  </div>
                  <div class="flex-grow-1 text-start">
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="fw-bold text-dark">Pay Online (UPI, Cards, NetBanking)</span>
                      @if (method() === 'Online') { <i class="bi bi-check-circle-fill text-primary fs-5"></i> }
                    </div>
                    <small class="text-muted d-block mt-1">
                      @if (c.options?.online) {
                        Instant & 100% secure via Razorpay (Google Pay, PhonePe, Paytm, Cards)
                      } @else {
                        Online payment temporarily unavailable for this store
                      }
                    </small>
                  </div>
                </button>

                <button class="option-card" [class.active]="method() === 'Cash'" [class.disabled]="!c.options?.cod" [disabled]="!c.options?.cod" (click)="method.set('Cash')">
                  <div class="option-icon-box bg-success-subtle text-success">
                    <i class="bi bi-cash-stack fs-4"></i>
                  </div>
                  <div class="flex-grow-1 text-start">
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="fw-bold text-dark">{{ deliveryType() === 'Pickup' ? 'Pay at Store' : 'Cash on Delivery' }}</span>
                      @if (method() === 'Cash') { <i class="bi bi-check-circle-fill text-primary fs-5"></i> }
                    </div>
                    <small class="text-muted d-block mt-1">
                      @if (c.options?.cod) {
                        Pay via cash or UPI directly when you receive your order
                      } @else {
                        Not available for this store
                      }
                    </small>
                  </div>
                </button>
              </div>

              <div class="mt-3">
                <label class="form-label small fw-bold text-secondary" for="notes">Special instructions for the store (optional)</label>
                <textarea id="notes" class="form-control rounded-3" rows="2" maxlength="500" [(ngModel)]="notes" placeholder="e.g. Please call before arriving or deliver after 5 PM"></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar Summary -->
        <div class="col-lg-5">
          <div class="card border-0 rounded-4 shadow-sm mb-3">
            <div class="card-body p-4">
              <h2 class="h6 fw-bold mb-3 d-flex align-items-center justify-content-between">
                <span>Order Summary</span>
                <span class="badge bg-light text-dark fw-normal rounded-pill px-2 py-1">{{ c.shopName }}</span>
              </h2>
              <div class="checkout-items-list mb-3">
                @for (l of c.items; track l.productId) {
                  <div class="d-flex justify-content-between align-items-center small py-2 border-bottom border-light gap-2">
                    <div class="min-w-0">
                      <div class="fw-semibold text-truncate">{{ l.name }}</div>
                      <small class="text-muted">{{ l.quantity }} × {{ l.finalPrice | inr }}@if (l.variantLabel) { ({{ l.variantLabel }}) }</small>
                    </div>
                    <span class="fw-bold flex-shrink-0 text-dark">{{ l.lineTotal | inr }}</span>
                  </div>
                }
              </div>

              <div class="summary-row small"><span>Subtotal</span><span>{{ c.totals.subtotal | inr }}</span></div>
              <div class="summary-row small"><span>Taxes & GST</span><span>{{ c.totals.gst | inr }}</span></div>
              <div class="summary-row small">
                <span>Delivery fee</span>
                <span>{{ c.totals.deliveryCharge ? (c.totals.deliveryCharge | inr) : 'FREE' }}</span>
              </div>
              <div class="summary-row summary-total pt-3 mt-2 border-top">
                <span>Total Amount</span>
                <span class="text-primary">{{ c.totals.total | inr }}</span>
              </div>
              @if (c.totals.savings) {
                <div class="card p-2 px-3 mt-3 border-0 bg-success-subtle text-success-emphasis rounded-3 small fw-bold text-center">
                  ✨ You are saving {{ c.totals.savings | inr }} on this order!
                </div>
              }
            </div>
          </div>

          <div class="card p-3 mb-3 border-0 rounded-4 bg-body-tertiary shadow-xs">
            <div class="d-flex gap-3 align-items-start">
              <span class="d-inline-flex align-items-center justify-content-center rounded-3 bg-white shadow-xs p-2 text-primary">
                <i class="bi bi-box-seam fs-4"></i>
              </span>
              <div>
                <strong class="d-block text-dark">Open Box Delivery Guarantee</strong>
                <div class="small text-muted mt-1">Open and inspect your package right in front of the delivery partner or shopkeeper before accepting.</div>
              </div>
            </div>
          </div>

          @if (!c.canCheckout) { <div class="alert alert-warning small rounded-3 py-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>Some items in your cart need attention. <a routerLink="/cart">Review Cart</a></div> }

          <div class="checkout-bar">
            <div class="d-lg-none">
              <div class="fw-bold fs-5 text-dark">{{ c.totals.total | inr }}</div>
              <small class="text-muted">Total to pay</small>
            </div>
            <button class="btn btn-primary btn-lg flex-grow-1 rounded-pill shadow-sm" [disabled]="!canPlace() || placing()" (click)="place()">
              @if (placing()) { <span class="spinner-border spinner-border-sm me-2"></span> }
              <span>{{ method() === 'Online' ? 'Pay Now · ' : 'Place Order · ' }}{{ c.totals.total | inr }}</span>
              <i class="bi bi-arrow-right ms-2"></i>
            </button>
          </div>
          <div class="checkout-spacer"></div>
        </div>
      </div>
    }

    <app-sheet [open]="addrOpen()" title="Add address" (closed)="addrOpen.set(false)">
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

  // Billing address: same as delivery by default; required for pickup too (PIN code needed)
  sameBilling = signal(true);
  billingId = signal<string | null>(null);
  billingAddressId = computed(() => (this.deliveryType() === 'Delivery' && this.sameBilling() ? this.addressId() : this.billingId()));
  billingOk = computed(() => !!this.addresses().find((a) => a._id === this.billingAddressId())?.zipCode);

  canPlace = computed(() => {
    const c = this.c();
    if (!c?.canCheckout || !this.method() || !this.billingOk()) return false;
    return this.deliveryType() === 'Pickup' || (!!this.addressId() && !!this.areaCheck()?.deliverable);
  });

  line(a: Address) {
    return [a.fullAddress, a.city !== a.taluka ? a.city : '', a.taluka, a.district, a.state].filter(Boolean).join(', ') + (a.zipCode ? ` - ${a.zipCode}` : '');
  }

  /** Result of the delivery-area check for the selected address (null while checking). */
  areaCheck = signal<{ deliverable: boolean; message: string } | null>(null);

  constructor() {
    effect(() => {
      const id = this.addressId();
      if (!id || this.deliveryType() !== 'Delivery') return;
      untracked(() => this.checkArea(id));
    });
  }

  private checkArea(id: string) {
    this.areaCheck.set(null);
    this.api.post<{ deliverable: boolean; message: string }>('/orders/check-delivery', { addressId: id }).subscribe({
      next: (r) => { if (this.addressId() === id) this.areaCheck.set(r.data); },
      error: (e) => this.areaCheck.set({ deliverable: false, message: errorMessage(e) }),
    });
  }

  ngOnInit() {
    this.api.get<Address[]>('/addresses').subscribe({
      next: (a) => {
        this.addresses.set(a);
        const def = a.find((x) => x.isDefault)?._id ?? a[0]?._id ?? null;
        this.addressId.set(def);
        this.billingId.set(def);
      },
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
    if (this.deliveryType() === 'Delivery' && this.sameBilling()) this.addressId.set(a._id);
    else this.billingId.set(a._id);
    if (!this.addressId()) this.addressId.set(a._id);
  }

  place() {
    if (!this.canPlace()) return;
    this.placing.set(true);
    const body = {
      deliveryType: this.deliveryType(),
      addressId: this.deliveryType() === 'Delivery' ? this.addressId() : undefined,
      billingAddressId: this.billingAddressId() || undefined,
      paymentMethod: this.method(),
      notes: this.notes || undefined,
    };
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
