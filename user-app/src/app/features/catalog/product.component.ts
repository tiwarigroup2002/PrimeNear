import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CartData, Product, Variant } from '../../core/models/api.models';
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
            @if (images().length) { <img [src]="images()[img()] || images()[0]" [alt]="p.name" /> } @else { <span class="pc-placeholder"><i class="bi bi-image"></i></span> }
            @if (discount()) { <span class="pc-badge">{{ discount() }}% OFF</span> }
            <button class="pc-heart" (click)="toggleWish()" [attr.aria-label]="p.inWishlist ? 'Remove from wishlist' : 'Add to wishlist'"><i class="bi" [class.bi-heart-fill]="p.inWishlist" [class.text-danger]="p.inWishlist" [class.bi-heart]="!p.inWishlist"></i></button>
          </div>
          @if (images().length > 1) {
            <div class="gallery-thumbs">
              @for (src of images(); track src; let i = $index) {
                <button [class.active]="i === img()" (click)="img.set(i)" [attr.aria-label]="'Image ' + (i + 1)"><img [src]="src" alt="" /></button>
              }
            </div>
          }
          @for (v of p.videos || []; track v) {
            <video class="product-video mt-2" [src]="v" controls playsinline preload="metadata"></video>
          }
        </div>
        <div class="col-lg-7">
          <div class="small text-muted">{{ p.categoryId?.name }}@if (p.subCategoryId?.name) { › {{ p.subCategoryId.name }} }</div>
          <h1 class="h4 fw-semibold mb-1">{{ p.name }}</h1>
          @if (p.ratingCount) {
            <div class="d-flex align-items-center gap-2 mb-2 small"><span class="badge bg-success"><i class="bi bi-star-fill"></i> {{ p.rating.toFixed(1) }}</span><span class="text-muted">{{ p.ratingCount }} ratings</span>@if (p.soldCount) { <span class="text-muted">· {{ p.soldCount }} sold</span> }</div>
          }
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            @if (p.hasVariants && !variant()) { <span class="text-muted small">from</span> }
            <span class="price-big">{{ price().finalPrice | inr }}</span>
            @if (price().mrp && price().mrp! > price().finalPrice) { <s class="text-muted">MRP {{ price().mrp | inr }}</s><span class="text-success fw-semibold">{{ discount() }}% off</span> }
          </div>
          <div class="small text-muted mb-2">{{ price().sellingPrice | inr }} + {{ p.gstRate }}% GST ({{ price().gstAmount | inr }}) · inclusive of all taxes</div>

          @if (p.hasVariants) {
            @if (p.colors?.length) {
              <div class="mb-2">
                <div class="small fw-semibold mb-1">Colour: <span class="fw-normal">{{ color() || 'choose' }}</span></div>
                <div class="d-flex flex-wrap gap-2">
                  @for (c of p.colors; track c) {
                    <button class="variant-chip" [class.active]="color() === c" [class.soldout]="!colorInStock(c)" (click)="pickColor(c)">
                      @if (thumbFor(c); as t) { <img [src]="t" alt="" /> }{{ c }}
                    </button>
                  }
                </div>
              </div>
            }
            @if (p.sizes?.length) {
              <div class="mb-2">
                <div class="small fw-semibold mb-1">Size: <span class="fw-normal">{{ size() || 'choose' }}</span></div>
                <div class="d-flex flex-wrap gap-2">
                  @for (s of p.sizes; track s) {
                    <button class="variant-chip size" [class.active]="size() === s" [class.soldout]="!sizeAvailable(s)" [disabled]="!sizeExists(s)" (click)="size.set(s)">{{ s }}</button>
                  }
                </div>
              </div>
            }
          }

          @if (!p.available) { <div class="alert alert-secondary py-2 small">This product is currently not available.</div> }
          @else if (p.hasVariants && !variant()) { <div class="text-muted small fw-semibold mb-2">Choose {{ missingChoice() }} to see stock</div> }
          @else if (stock() <= 0) { <div class="alert alert-danger py-2 small"><i class="bi bi-x-circle me-1"></i>Out of stock@if (variant()) { in {{ variant()!.label }} }</div> }
          @else if (stock() <= 5) { <div class="text-danger small fw-semibold mb-2">Only {{ stock() }} left – hurry!</div> }
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
                  <button (click)="changeQty(inCart() + 1)" [disabled]="busy() || inCart() >= stock()" aria-label="Increase"><i class="bi bi-plus-lg"></i></button>
                </div>
                <a routerLink="/cart" class="btn btn-outline-primary flex-grow-1">Go to cart</a>
              } @else {
                <button class="btn btn-outline-primary flex-grow-1" (click)="add(false)" [disabled]="busy() || !canBuy()"><i class="bi bi-cart-plus me-1"></i>Add to cart</button>
              }
              <button class="btn btn-primary flex-grow-1" (click)="add(true)" [disabled]="busy() || !canBuy()"><i class="bi bi-lightning-charge me-1"></i>Buy now</button>
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
  img = signal(0);
  busy = signal(false);

  // ---- Colour / size choice ----
  color = signal('');
  size = signal('');
  /** Quantity in the cart: per variant for products with variants */
  private cartQty = signal<Record<string, number>>({});

  variant = computed<Variant | null>(() => {
    const p = this.p();
    if (!p?.hasVariants) return null;
    const needColor = !!p.colors?.length;
    const needSize = !!p.sizes?.length;
    return p.variants!.find((v) => (!needColor || v.color === this.color()) && (!needSize || v.size === this.size())) ?? null;
  });
  images = computed(() => {
    const p = this.p();
    if (!p) return [];
    const v = this.variant();
    if (v?.images?.length) return v.images;
    // A colour chosen but no size yet: show that colour's photos
    const byColor = p.variants?.find((x) => x.color === this.color() && x.images?.length);
    return byColor?.images?.length ? byColor.images : p.images;
  });
  price = computed(() => {
    const v = this.variant();
    const p = this.p()!;
    return v ? { sellingPrice: v.sellingPrice, gstAmount: v.gstAmount, finalPrice: v.finalPrice, mrp: v.mrp } : { sellingPrice: p.sellingPrice, gstAmount: p.gstAmount, finalPrice: p.finalPrice, mrp: p.mrp };
  });
  discount = computed(() => {
    const pr = this.price();
    return pr.mrp && pr.mrp > pr.finalPrice ? Math.round(((pr.mrp - pr.finalPrice) / pr.mrp) * 100) : 0;
  });
  stock = computed(() => (this.p()?.hasVariants ? this.variant()?.stock ?? 0 : this.p()?.stock ?? 0));
  inCart = computed(() => this.cartQty()[this.variant()?._id ?? ''] ?? 0);
  canBuy = computed(() => !this.p()?.hasVariants || (!!this.variant() && this.stock() > 0));
  missingChoice = computed(() => {
    const p = this.p();
    const parts = [];
    if (p?.colors?.length && !this.color()) parts.push('a colour');
    if (p?.sizes?.length && !this.size()) parts.push('a size');
    return parts.join(' and ') || 'another option';
  });

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
        const p: Product = d.product;
        this.p.set(p);
        this.seller.set(d.seller);
        this.reviews.set(d.reviews);
        this.related.set(d.related);
        this.isActiveShop.set(d.isActiveShop);
        this.cartQty.set(p.hasVariants ? { ...(p.inCartByVariant || {}) } : { '': p.inCart || 0 });
        this.preselect(p);
        this.loading.set(false);
        window.scrollTo({ top: 0 });
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  /** Starts on the first combination that is in stock. */
  private preselect(p: Product) {
    if (!p.hasVariants) return;
    const first = p.variants!.find((v) => v.stock > 0) ?? p.variants![0];
    this.color.set(first?.color || '');
    this.size.set(first?.size || '');
  }

  pickColor(c: string) {
    this.color.set(c);
    this.img.set(0);
    // Keep the size if it exists in this colour, else pick the first size in stock
    if (this.p()?.sizes?.length && !this.sizeAvailable(this.size())) {
      const v = this.p()!.variants!.find((x) => x.color === c && x.stock > 0) ?? this.p()!.variants!.find((x) => x.color === c);
      this.size.set(v?.size || '');
    }
  }

  private forColor(s: string) {
    const p = this.p()!;
    return p.variants!.find((v) => v.size === s && (!p.colors?.length || v.color === this.color()));
  }
  sizeExists(s: string) {
    return !!this.forColor(s);
  }
  sizeAvailable(s: string) {
    return (this.forColor(s)?.stock ?? 0) > 0;
  }
  colorInStock(c: string) {
    return this.p()!.variants!.some((v) => v.color === c && v.stock > 0);
  }
  thumbFor(c: string) {
    return this.p()!.variants!.find((v) => v.color === c && v.images?.length)?.images[0] ?? null;
  }

  back() {
    history.length > 1 ? history.back() : this.router.navigate(['/home']);
  }

  private syncCart(c: CartData) {
    const p = this.p()!;
    const map: Record<string, number> = {};
    c.items.filter((i) => i.productId === p._id).forEach((i) => (map[i.variantId || ''] = i.quantity));
    this.cartQty.set(map);
  }

  async add(buyNow: boolean) {
    const p = this.p()!;
    if (p.hasVariants && !this.variant()) return this.toast.warning(`Choose ${this.missingChoice()}`);
    if (!this.isActiveShop() && this.cart.count() && !(await this.confirm.confirm('Switch shop?', `Your cart has items from another shop. Adding this will empty it and switch to ${this.seller()?.shopName}.`, 'warning', 'Continue'))) return;
    if (buyNow && this.inCart()) {
      this.router.navigate(['/checkout']);
      return;
    }
    this.busy.set(true);
    this.cart.add(p._id, 1, this.variant()?._id).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.syncCart(c);
        if (!this.isActiveShop()) {
          this.auth.setActiveSeller(p.sellerId);
          this.isActiveShop.set(true);
        }
        if (buyNow) this.router.navigate(['/checkout']);
        else this.toast.success(this.variant() ? `Added ${this.variant()!.label} to cart` : 'Added to cart');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  changeQty(q: number) {
    const id = this.p()!._id;
    const vid = this.variant()?._id;
    this.busy.set(true);
    const req = q <= 0 ? this.cart.remove(id, vid) : this.cart.update(id, q, vid);
    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.syncCart(c);
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
