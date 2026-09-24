import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Product } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, ProductCardComponent, StarsComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-product',
  imports: [RouterLink, DatePipe, InrPipe, ProductCardComponent, StarsComponent, StateComponent],
  template: `
    <app-state [loading]="loading()" [error]="error()" />
    @if (p(); as p) {
      <a href="" (click)="$event.preventDefault(); back()" class="small text-muted text-decoration-none d-inline-block mb-2"><i class="bi bi-arrow-left"></i> Back</a>
      <div class="row g-3 g-lg-4">
        <div class="col-lg-5">
          <div class="gallery-main">
            @if (p.images.length) { <img [src]="p.images[img()]" [alt]="p.name" /> } @else { <span class="pc-placeholder"><i class="bi bi-image"></i></span> }
            @if (p.discountPercent) { <span class="pc-badge">{{ p.discountPercent }}% OFF</span> }
            <button class="pc-heart" (click)="toggleWish()" [attr.aria-label]="p.inWishlist ? 'Remove from wishlist' : 'Add to wishlist'"><i class="bi" [class.bi-heart-fill]="p.inWishlist" [class.text-danger]="p.inWishlist" [class.bi-heart]="!p.inWishlist"></i></button>
          </div>
          @if (p.images.length > 1) {
            <div class="gallery-thumbs">
              @for (src of p.images; track src; let i = $index) {
                <button [class.active]="i === img()" (click)="img.set(i)" [attr.aria-label]="'Image ' + (i + 1)"><img [src]="src" alt="" /></button>
              }
            </div>
          }
        </div>
        <div class="col-lg-7">
          <div class="small text-muted">{{ p.categoryId?.name }}@if (p.subCategoryId?.name) { › {{ p.subCategoryId.name }} }</div>
          <h1 class="h4 fw-semibold mb-1">{{ p.name }}</h1>
          @if (p.ratingCount) {
            <div class="d-flex align-items-center gap-2 mb-2 small"><span class="badge bg-success"><i class="bi bi-star-fill"></i> {{ p.rating.toFixed(1) }}</span><span class="text-muted">{{ p.ratingCount }} ratings</span>@if (p.soldCount) { <span class="text-muted">· {{ p.soldCount }} sold</span> }</div>
          }
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            <span class="price-big">{{ p.finalPrice | inr }}</span>
            @if (p.mrp && p.mrp > p.finalPrice) { <s class="text-muted">MRP {{ p.mrp | inr }}</s><span class="text-success fw-semibold">{{ p.discountPercent }}% off</span> }
          </div>
          <div class="small text-muted mb-2">{{ p.sellingPrice | inr }} + {{ p.gstRate }}% GST ({{ p.gstAmount | inr }}) · inclusive of all taxes</div>

          @if (!p.available) { <div class="alert alert-secondary py-2 small">This product is currently not available.</div> }
          @else if (!p.inStock) { <div class="alert alert-danger py-2 small"><i class="bi bi-x-circle me-1"></i>Out of stock</div> }
          @else if (p.stock <= 5) { <div class="text-danger small fw-semibold mb-2">Only {{ p.stock }} left – hurry!</div> }
          @else { <div class="text-success small fw-semibold mb-2"><i class="bi bi-check-circle me-1"></i>In stock</div> }

          @if (!isActiveShop()) {
            <div class="alert alert-info py-2 small"><i class="bi bi-info-circle me-1"></i>This product is from <strong>{{ seller()?.shopName }}</strong>. Adding it will switch your shop@if (cart.count()) { and empty your current cart }.</div>
          }

          @if (p.available && p.inStock) {
            <div class="buy-bar">
              @if (inCart()) {
                <div class="qty-stepper">
                  <button (click)="changeQty(inCart() - 1)" [disabled]="busy()" aria-label="Decrease"><i class="bi" [class.bi-dash-lg]="inCart() > 1" [class.bi-trash]="inCart() === 1"></i></button>
                  <span>{{ inCart() }}</span>
                  <button (click)="changeQty(inCart() + 1)" [disabled]="busy() || inCart() >= p.stock" aria-label="Increase"><i class="bi bi-plus-lg"></i></button>
                </div>
                <a routerLink="/cart" class="btn btn-outline-primary flex-grow-1">Go to cart</a>
              } @else {
                <button class="btn btn-outline-primary flex-grow-1" (click)="add(false)" [disabled]="busy()"><i class="bi bi-cart-plus me-1"></i>Add to cart</button>
              }
              <button class="btn btn-primary flex-grow-1" (click)="add(true)" [disabled]="busy()"><i class="bi bi-lightning-charge me-1"></i>Buy now</button>
            </div>
          }

          @if (p.description) {
            <h2 class="h6 fw-semibold mt-3">About this item</h2>
            <p class="text-pre small mb-2">{{ p.description }}</p>
          }

          <a [routerLink]="['/shop', seller()?._id]" class="card card-body d-flex flex-row align-items-center gap-3 text-decoration-none text-body mt-3 py-2">
            @if (seller()?.shopImage) { <img [src]="seller()!.shopImage" class="shop-thumb" alt="" /> } @else { <span class="shop-thumb shop-thumb-icon"><i class="bi bi-shop"></i></span> }
            <div class="flex-grow-1 min-w-0"><div class="small text-muted">Sold by</div><div class="fw-semibold text-truncate">{{ seller()?.shopName }}</div></div>
            @if (seller()?.ratingCount) { <span class="small"><i class="bi bi-star-fill text-warning"></i> {{ seller()!.rating }}</span> }
            <i class="bi bi-chevron-right text-muted"></i>
          </a>
        </div>
      </div>

      <div class="section-title"><h2>Ratings & reviews</h2></div>
      @if (reviews().length) {
        <div class="card"><div class="m-list">
          @for (r of reviews(); track r._id) {
            <div class="m-item d-block">
              <div class="d-flex justify-content-between"><app-stars [value]="r.rating" /><small class="text-muted">{{ r.createdAt | date: 'd MMM y' }}</small></div>
              @if (r.reviewText) { <p class="mb-1 mt-1 small">{{ r.reviewText }}</p> }
              <small class="text-muted">{{ r.userId?.name || 'Customer' }}</small>
            </div>
          }
        </div></div>
      } @else { <p class="text-muted small">No reviews yet. Be the first to review after you buy.</p> }

      @if (related().length) {
        <div class="section-title"><h2>You may also like</h2></div>
        <div class="h-scroll">@for (r of related(); track r._id) { <app-product-card [product]="r" /> }</div>
      }
    }
  `,
})
export class ProductComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  cart = inject(CartService);

  loading = signal(true);
  error = signal<string | null>(null);
  p = signal<(Product & { categoryId?: any; subCategoryId?: any }) | null>(null);
  seller = signal<any>(null);
  reviews = signal<any[]>([]);
  related = signal<Product[]>([]);
  isActiveShop = signal(true);
  inCart = signal(0);
  img = signal(0);
  busy = signal(false);

  ngOnInit() {
    const s = this.route.paramMap.subscribe((pm) => this.load(pm.get('id')!));
    this.destroyRef.onDestroy(() => s.unsubscribe());
  }

  load(id: string) {
    this.loading.set(true);
    this.p.set(null);
    this.img.set(0);
    this.api.get<any>(`/products/${id}`).subscribe({
      next: (d) => {
        this.p.set(d.product);
        this.seller.set(d.seller);
        this.reviews.set(d.reviews);
        this.related.set(d.related);
        this.isActiveShop.set(d.isActiveShop);
        this.inCart.set(d.product.inCart || 0);
        this.loading.set(false);
        window.scrollTo({ top: 0 });
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  back() {
    history.length > 1 ? history.back() : this.router.navigate(['/home']);
  }

  async add(buyNow: boolean) {
    const p = this.p()!;
    if (!this.isActiveShop() && this.cart.count() && !(await this.confirm.confirm('Switch shop?', `Your cart has items from another shop. Adding this will empty it and switch to ${this.seller()?.shopName}.`, 'warning', 'Continue'))) return;
    if (buyNow && this.inCart()) {
      this.router.navigate(['/checkout']);
      return;
    }
    this.busy.set(true);
    this.cart.add(p._id).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.inCart.set(c.items.find((i) => i.productId === p._id)?.quantity ?? 1);
        if (!this.isActiveShop()) {
          this.auth.setActiveSeller(p.sellerId);
          this.isActiveShop.set(true);
        }
        if (buyNow) this.router.navigate(['/checkout']);
        else this.toast.success('Added to cart');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  changeQty(q: number) {
    const id = this.p()!._id;
    this.busy.set(true);
    const req = q <= 0 ? this.cart.remove(id) : this.cart.update(id, q);
    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.inCart.set(c.items.find((i) => i.productId === id)?.quantity ?? 0);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  toggleWish() {
    const p = this.p()!;
    const on = !p.inWishlist;
    this.p.set({ ...p, inWishlist: on });
    const req = on ? this.api.post('/wishlist/add', { productId: p._id }) : this.api.delete(`/wishlist/${p._id}`);
    req.subscribe({
      next: () => this.toast.success(on ? 'Saved to wishlist' : 'Removed from wishlist'),
      error: (e) => {
        this.p.set({ ...p, inWishlist: !on });
        this.toast.error(errorMessage(e));
      },
    });
  }
}
