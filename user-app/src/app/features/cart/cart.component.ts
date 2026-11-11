import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CartData, CartLine } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, InrPipe, PageHeaderComponent, StateComponent],
  template: `
    <app-page-header title="My Cart" icon="bi-bag-check-fill" [subtitle]="c()?.shopName ? 'Ordering from ' + c()!.shopName : ''">
      @if (c()?.items?.length) {
        <button class="btn btn-sm btn-light border text-danger rounded-pill px-3 shadow-xs" (click)="clear()">
          <i class="bi bi-trash3 me-1"></i>Clear All
        </button>
      }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (c(); as c) {
      @if (!c.items.length) {
        <div class="card p-5 text-center border-0 rounded-4 shadow-sm my-4 bg-body-tertiary">
          <div class="mb-3">
            <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-white shadow-sm" style="width: 84px; height: 84px;">
              <i class="bi bi-cart-x text-primary fs-1"></i>
            </span>
          </div>
          <h2 class="h5 fw-bold mb-1">Your cart is empty</h2>
          <p class="text-muted small mb-3">Explore fresh deals and products from your favourite neighbourhood stores.</p>
          <div>
            <a routerLink="/home" class="btn btn-primary rounded-pill px-4 py-2 shadow-sm">
              <i class="bi bi-shop me-2"></i>Explore Nearby Stores
            </a>
          </div>
        </div>
      } @else {
        <div class="row g-3 g-lg-4">
          <div class="col-lg-8">
            <!-- Free delivery announcement / meter -->
            @if (c.options?.delivery && c.options?.freeDeliveryAbove) {
              @if (c.totals.deliveryCharge && c.options!.freeDeliveryAbove > c.totals.itemsTotal) {
                <div class="card p-3 mb-3 border-0 rounded-4 bg-primary-subtle text-primary-emphasis shadow-xs">
                  <div class="d-flex align-items-center gap-2 small fw-semibold mb-1">
                    <i class="bi bi-truck fs-5"></i>
                    <span>Add {{ c.options!.freeDeliveryAbove - c.totals.itemsTotal | inr: 0 }} more to get <strong>FREE Delivery</strong>!</span>
                  </div>
                  <div class="progress" style="height: 6px;">
                    <div class="progress-bar bg-primary" [style.width.%]="(c.totals.itemsTotal / c.options!.freeDeliveryAbove) * 100"></div>
                  </div>
                </div>
              } @else if (!c.totals.deliveryCharge) {
                <div class="card p-2 px-3 mb-3 border-0 rounded-4 bg-success-subtle text-success-emphasis d-flex flex-row align-items-center gap-2 small fw-semibold shadow-xs">
                  <i class="bi bi-check-circle-fill text-success fs-5"></i>
                  <span>Yay! You've unlocked <strong>FREE Delivery</strong> on this order! 🎉</span>
                </div>
              }
            }

            <div class="card border-0 rounded-4 shadow-sm overflow-hidden mb-3">
              <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                <span class="fw-bold">{{ c.totals.itemCount }} item{{ c.totals.itemCount === 1 ? '' : 's' }} in cart</span>
                <span class="small text-muted"><i class="bi bi-geo-alt-fill text-primary me-1"></i>{{ c.shopName }}</span>
              </div>
              @for (l of c.items; track l.productId + (l.variantId || "")) {
                <div class="cart-line" [class.opacity-75]="l.problem">
                  <a [routerLink]="['/product', l.productId]" class="flex-shrink-0">
                    @if (l.image) { <img [src]="l.image" class="thumb rounded-3 shadow-xs" alt="" /> } @else { <span class="thumb rounded-3 bg-light d-flex align-items-center justify-content-center text-muted"><i class="bi bi-image"></i></span> }
                  </a>
                  <div class="flex-grow-1 min-w-0">
                    <a [routerLink]="['/product', l.productId]" class="text-body text-decoration-none fw-bold line-clamp-2">{{ l.name }}</a>
                    @if (l.variantLabel) { <span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill my-1">{{ l.variantLabel }}</span> }
                    <div class="small mt-1">
                      <strong class="text-dark">{{ l.finalPrice | inr }}</strong>
                      @if (l.mrp && l.mrp > l.finalPrice) { <s class="text-muted ms-1 small">{{ l.mrp | inr: 0 }}</s> }
                      <span class="text-muted ms-1">· incl. {{ l.gstRate }}% GST</span>
                    </div>
                    @if (l.problem) { <div class="small text-danger fw-semibold mt-1"><i class="bi bi-exclamation-triangle-fill me-1"></i>{{ l.problem }}</div> }
                    <div class="d-flex align-items-center justify-content-between mt-2 pt-1">
                      <div class="qty-stepper">
                        <button (click)="qty(l, l.quantity - 1)" [disabled]="busy() === key(l)" aria-label="Decrease"><i class="bi" [class.bi-dash-lg]="l.quantity > 1" [class.bi-trash3]="l.quantity === 1"></i></button>
                        <span class="fw-bold">{{ l.quantity }}</span>
                        <button (click)="qty(l, l.quantity + 1)" [disabled]="busy() === key(l) || l.quantity >= l.stock" aria-label="Increase"><i class="bi bi-plus-lg"></i></button>
                      </div>
                      <strong class="fs-6 text-dark">{{ l.lineTotal | inr }}</strong>
                    </div>
                  </div>
                </div>
              }
            </div>

            <div class="d-flex justify-content-between align-items-center">
              <a routerLink="/home" class="btn btn-outline-primary rounded-pill px-3 shadow-xs">
                <i class="bi bi-plus-circle me-1"></i>Add more items
              </a>
            </div>
          </div>

          <div class="col-lg-4">
            <div class="card border-0 rounded-4 shadow-sm mb-3">
              <div class="card-body p-4">
                <h2 class="h6 fw-bold mb-3 d-flex align-items-center gap-2">
                  <i class="bi bi-receipt text-primary"></i>Bill Details
                </h2>
                <div class="summary-row small"><span>Items subtotal</span><span>{{ c.totals.subtotal | inr }}</span></div>
                <div class="summary-row small"><span>GST & taxes</span><span>{{ c.totals.gst | inr }}</span></div>
                <div class="summary-row small">
                  <span>Delivery fee</span>
                  <span>@if (c.options?.delivery) { {{ c.totals.deliveryCharge ? (c.totals.deliveryCharge | inr) : 'FREE' }} } @else { Store Pickup }</span>
                </div>
                <div class="summary-row summary-total pt-3 mt-2 border-top">
                  <span>To Pay</span>
                  <span class="text-primary">{{ c.totals.total | inr }}</span>
                </div>
                @if (c.totals.savings) {
                  <div class="card p-2 px-3 mt-3 border-0 bg-success-subtle text-success-emphasis rounded-3 small fw-bold text-center">
                    🎉 You are saving {{ c.totals.savings | inr }} on this order!
                  </div>
                }
              </div>
            </div>

            <div class="card p-3 border-0 bg-body-tertiary rounded-4 shadow-xs small text-muted mb-3">
              <div class="d-flex gap-2 align-items-start">
                <i class="bi bi-shield-check text-success fs-5"></i>
                <div>
                  <div class="fw-bold text-dark">Safe & Contactless Delivery</div>
                  <div>Inspected, packed, and delivered directly by your local store.</div>
                </div>
              </div>
            </div>

            @if (!c.canCheckout) { <div class="alert alert-warning small rounded-3 py-2"><i class="bi bi-exclamation-circle me-1"></i>Remove or fix unavailable items to proceed.</div> }
            <div class="checkout-bar">
              <div class="d-lg-none">
                <div class="fw-bold fs-5 text-dark">{{ c.totals.total | inr }}</div>
                <small class="text-muted">Total Payable</small>
              </div>
              <a routerLink="/checkout" class="btn btn-primary btn-lg flex-grow-1 rounded-pill shadow-sm" [class.disabled]="!c.canCheckout">
                <span>Proceed to Checkout</span> <i class="bi bi-arrow-right ms-2"></i>
              </a>
            </div>
            <div class="checkout-spacer"></div>
          </div>
        </div>
      }
    }
  `,
})
export class CartComponent implements OnInit {
  private api = inject(ApiService);
  private cart = inject(CartService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  c = signal<CartData | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal<string | null>(null);

  ngOnInit() {
    this.cart.load().subscribe({
      next: (c) => { this.c.set(c); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  key(l: CartLine) {
    return l.productId + (l.variantId || '');
  }

  qty(l: CartLine, q: number) {
    this.busy.set(this.key(l));
    const req = q <= 0 ? this.cart.remove(l.productId, l.variantId) : this.cart.update(l.productId, q, l.variantId);
    req.subscribe({
      next: (c) => { this.busy.set(null); this.c.set(c); },
      error: (e) => { this.busy.set(null); this.toast.error(errorMessage(e)); },
    });
  }

  async clear() {
    if (!(await this.confirm.confirm('Clear cart?', 'All items will be removed from your cart.', 'danger', 'Clear'))) return;
    this.api.post<CartData>('/cart/clear').subscribe({
      next: (r) => { this.c.set(r.data); this.cart.reset(0); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
