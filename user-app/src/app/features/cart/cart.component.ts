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
    <app-page-header title="My cart" icon="bi-cart3" [subtitle]="c()?.shopName ? 'From ' + c()!.shopName : ''">
      @if (c()?.items?.length) { <button class="btn btn-sm btn-light text-danger" (click)="clear()"><i class="bi bi-trash me-1"></i>Clear</button> }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (c(); as c) {
      @if (!c.items.length) {
        <div class="text-center py-5">
          <i class="bi bi-cart-x display-4 text-muted opacity-50"></i>
          <p class="text-muted mt-2">Your cart is empty</p>
          <a routerLink="/home" class="btn btn-primary">Start shopping</a>
        </div>
      } @else {
        <div class="row g-3">
          <div class="col-lg-8">
            <div class="card">
              @for (l of c.items; track l.productId) {
                <div class="cart-line" [class.opacity-75]="l.problem">
                  <a [routerLink]="['/product', l.productId]">@if (l.image) { <img [src]="l.image" class="thumb" alt="" /> } @else { <span class="thumb"><i class="bi bi-image"></i></span> }</a>
                  <div class="flex-grow-1 min-w-0">
                    <a [routerLink]="['/product', l.productId]" class="text-body text-decoration-none fw-semibold line-clamp-2">{{ l.name }}</a>
                    <div class="small"><strong>{{ l.finalPrice | inr }}</strong>@if (l.mrp && l.mrp > l.finalPrice) { <s class="text-muted ms-1">{{ l.mrp | inr: 0 }}</s> } <span class="text-muted">incl. {{ l.gstRate }}% GST</span></div>
                    @if (l.problem) { <div class="small text-danger fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i>{{ l.problem }}</div> }
                    <div class="d-flex align-items-center justify-content-between mt-2">
                      <div class="qty-stepper">
                        <button (click)="qty(l, l.quantity - 1)" [disabled]="busy() === l.productId" aria-label="Decrease"><i class="bi" [class.bi-dash-lg]="l.quantity > 1" [class.bi-trash]="l.quantity === 1"></i></button>
                        <span>{{ l.quantity }}</span>
                        <button (click)="qty(l, l.quantity + 1)" [disabled]="busy() === l.productId || l.quantity >= l.stock" aria-label="Increase"><i class="bi bi-plus-lg"></i></button>
                      </div>
                      <strong>{{ l.lineTotal | inr }}</strong>
                    </div>
                  </div>
                </div>
              }
            </div>
            <a routerLink="/home" class="btn btn-link px-0 mt-1"><i class="bi bi-plus-circle me-1"></i>Add more items</a>
          </div>
          <div class="col-lg-4">
            <div class="card"><div class="card-body">
              <h2 class="h6 fw-semibold">Bill details</h2>
              <div class="summary-row small"><span>Items ({{ c.totals.itemCount }})</span><span>{{ c.totals.subtotal | inr }}</span></div>
              <div class="summary-row small"><span>GST</span><span>{{ c.totals.gst | inr }}</span></div>
              <div class="summary-row small"><span>Delivery</span><span>@if (c.options?.delivery) { {{ c.totals.deliveryCharge ? (c.totals.deliveryCharge | inr) : 'FREE' }} } @else { Pickup }</span></div>
              <div class="summary-row summary-total"><span>Total</span><span>{{ c.totals.total | inr }}</span></div>
              @if (c.totals.savings) { <div class="text-success small fw-semibold mt-2"><i class="bi bi-tag me-1"></i>You save {{ c.totals.savings | inr }} on this order</div> }
              @if (c.options?.delivery && c.options?.freeDeliveryAbove && c.totals.deliveryCharge) {
                <div class="small text-muted mt-1">Add {{ c.options!.freeDeliveryAbove - c.totals.itemsTotal | inr: 0 }} more for free delivery</div>
              }
            </div></div>
            @if (!c.canCheckout) { <div class="alert alert-warning small mt-2 py-2">Remove or fix the items marked in red to continue.</div> }
            <div class="checkout-bar">
              <div class="d-lg-none"><div class="fw-bold">{{ c.totals.total | inr }}</div><small class="text-muted">Total</small></div>
              <a routerLink="/checkout" class="btn btn-primary btn-lg flex-grow-1" [class.disabled]="!c.canCheckout">Checkout <i class="bi bi-arrow-right"></i></a>
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

  qty(l: CartLine, q: number) {
    this.busy.set(l.productId);
    const req = q <= 0 ? this.cart.remove(l.productId) : this.cart.update(l.productId, q);
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
