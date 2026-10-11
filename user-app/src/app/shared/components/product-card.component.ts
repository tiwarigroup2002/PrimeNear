import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../core/models/api.models';
import { CartService } from '../../core/services/cart.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe } from '../pipes/inr.pipe';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, InrPipe],
  template: `
    <div class="product-card">
      <a [routerLink]="['/product', p._id]" class="pc-img">
        @if (p.images[0]) { <img [src]="p.images[0]" alt="" loading="lazy" (error)="$any($event.target).remove()" /> } @else { <span class="pc-placeholder"><i class="bi bi-image"></i></span> }
        @if (p.discountPercent) { <span class="pc-badge">{{ p.discountPercent }}% OFF</span> }
        @if (!p.inStock) { <span class="pc-out">Out of stock</span> }
      </a>
      <button class="pc-heart" (click)="toggleWish()" [attr.aria-label]="wished() ? 'Remove from wishlist' : 'Add to wishlist'"><i class="bi" [class.bi-heart-fill]="wished()" [class.text-danger]="wished()" [class.bi-heart]="!wished()"></i></button>
      <a [routerLink]="['/product', p._id]" class="pc-body">
        <div class="pc-name">{{ p.name }}</div>
        @if (p.ratingCount) { <div class="pc-rating"><span class="badge bg-success"><i class="bi bi-star-fill"></i> {{ p.rating.toFixed(1) }}</span> <span class="text-muted">({{ p.ratingCount }})</span></div> }
        <div class="pc-price">@if (p.hasVariants) { <small class="text-muted">from</small> }<strong>{{ p.finalPrice | inr: 0 }}</strong>@if (p.mrp && p.mrp > p.finalPrice) { <s>{{ p.mrp | inr: 0 }}</s> }</div>
        @if (p.hasVariants) { <div class="small text-muted text-truncate">@if (p.colors?.length) { {{ p.colors!.length }} colour{{ p.colors!.length > 1 ? "s" : "" }} }@if (p.colors?.length && p.sizes?.length) { · }@if (p.sizes?.length) { {{ p.sizes!.join(", ") }} }</div> }
      </a>
      <div class="pc-foot">
        @if (p.inStock) {
          @if (p.hasVariants) {
            <a class="btn btn-sm btn-outline-primary w-100" [routerLink]="['/product', p._id]"><i class="bi bi-palette me-1"></i>Choose options</a>
          } @else {
            <button class="btn btn-sm btn-outline-primary w-100" (click)="add()" [disabled]="busy()">@if (busy()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-cart-plus me-1"></i>Add }</button>
          }
        } @else {
          <button class="btn btn-sm btn-light w-100" disabled>Notify later</button>
        }
      </div>
    </div>
  `,
})
export class ProductCardComponent {
  @Input({ required: true }) set product(v: Product) { this.p = v; this.wished.set(!!v.inWishlist); }
  @Output() wishChange = new EventEmitter<boolean>();
  p!: Product;
  wished = signal(false);
  busy = signal(false);
  private cart = inject(CartService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  add() {
    this.busy.set(true);
    this.cart.add(this.p._id).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Added to cart'); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  toggleWish() {
    const on = !this.wished();
    this.wished.set(on);
    const req = on ? this.api.post('/wishlist/add', { productId: this.p._id }) : this.api.delete(`/wishlist/${this.p._id}`);
    req.subscribe({
      next: () => { this.wishChange.emit(on); if (on) this.toast.success('Saved to wishlist'); },
      error: (e) => { this.wished.set(!on); this.toast.error(errorMessage(e)); },
    });
  }
}
