import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Product } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { ProductCardComponent, StateComponent } from '../../shared';
import { catIcon } from '../../shared/cat-icon';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ProductCardComponent, StateComponent],
  template: `
    <app-state [loading]="loading()" [error]="error()" loadingText="Opening shop..." />
    @if (data(); as d) {
      <section class="shop-hero mb-3">
        <div class="d-flex align-items-center gap-3 position-relative" style="z-index:1">
          @if (d.seller.shopImage) { <img [src]="d.seller.shopImage" class="hero-img" alt="" /> } @else { <span class="hero-img"><i class="bi bi-shop"></i></span> }
          <div class="min-w-0 flex-grow-1">
            <div class="small opacity-75">{{ greeting() }}{{ auth.user()?.name ? ', ' + firstName() : '' }} 👋</div>
            <h1 class="h5 fw-bold mb-1 text-truncate">{{ d.seller.shopName }}</h1>
            <div class="d-flex flex-wrap gap-1">
              @if (d.seller.ratingCount) { <span class="hero-chip"><i class="bi bi-star-fill"></i> {{ d.seller.rating }} ({{ d.seller.ratingCount }})</span> }
              @if (d.seller.tahsil) { <span class="hero-chip"><i class="bi bi-geo-alt"></i> {{ d.seller.tahsil }}</span> }
              @if (d.seller.delivery) { <span class="hero-chip"><i class="bi bi-truck"></i> {{ d.seller.freeDeliveryAbove ? 'Free delivery above ₹' + d.seller.freeDeliveryAbove : 'Home delivery' }}</span> }
              @else { <span class="hero-chip"><i class="bi bi-shop-window"></i> Store pickup</span> }
              @if (d.seller.cod) { <span class="hero-chip"><i class="bi bi-cash"></i> COD</span> }
            </div>
          </div>
          <a [routerLink]="['/shop', d.seller._id]" class="btn btn-sm btn-light rounded-pill flex-shrink-0">Info</a>
        </div>
      </section>

      <a routerLink="/search" class="d-flex d-md-none align-items-center gap-2 bg-body border rounded-3 px-3 py-2 text-muted text-decoration-none mb-3"><i class="bi bi-search"></i> Search in {{ d.seller.shopName }}</a>

      @if (d.categories.length) {
        <div class="section-title"><h2>Categories</h2><a routerLink="/search" class="small">See all</a></div>
        <div class="cat-scroll">
          @for (c of d.categories; track c._id) {
            <a class="cat-pill" [routerLink]="['/search']" [queryParams]="{ category: c._id }">
              <span class="ic">@if (c.icon) { <img [src]="c.icon" alt="" style="width:34px;height:34px;object-fit:contain" /> } @else { <i class="bi {{ icon(c.name) }}"></i> }</span>
              <span class="line-clamp-2">{{ c.name }}</span>
            </a>
          }
        </div>
      }

      <!-- Orders are one tap away (also the bag icon in the header) instead of a list on the home page -->
      <a routerLink="/orders" class="orders-link mt-3">
        <span class="orders-link-icon"><i class="bi bi-bag-check"></i></span>
        <span class="flex-grow-1"><span class="fw-semibold d-block">My orders</span><small class="text-muted">Track orders and see your order history</small></span>
        @if (d.recentOrders.length) { <span class="badge rounded-pill text-bg-light border">{{ d.recentOrders.length }}+</span> }
        <i class="bi bi-chevron-right text-muted"></i>
      </a>

      @if (d.featured.length) {
        <div class="section-title"><h2>Best sellers</h2><a routerLink="/search" [queryParams]="{ sortBy: 'popular' }" class="small">See all</a></div>
        <div class="h-scroll">@for (p of d.featured; track p._id) { <app-product-card [product]="p" /> }</div>
      }
      @if (d.newArrivals.length) {
        <div class="section-title"><h2>New arrivals</h2><a routerLink="/search" [queryParams]="{ sortBy: 'new' }" class="small">See all</a></div>
        <div class="product-grid">@for (p of d.newArrivals; track p._id) { <app-product-card [product]="p" /> }</div>
      }
      @if (!d.featured.length && !d.newArrivals.length) {
        <app-state [empty]="true" icon="bi-box-seam" emptyText="This shop has not added any products yet." />
      }
    }
  `,
})
export class HomeComponent {
  private api = inject(ApiService);
  auth = inject(AuthService);
  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<{ seller: any; categories: any[]; featured: Product[]; newArrivals: Product[]; recentOrders: any[] } | null>(null);
  icon = catIcon;

  private loadedFor: string | null | undefined;

  constructor() {
    // Reload whenever the active shop changes (shop switcher in the header)
    effect(() => {
      const id = this.auth.activeSellerId();
      if (id !== this.loadedFor) untracked(() => this.load());
    });
  }

  load() {
    this.loadedFor = this.auth.activeSellerId();
    this.loading.set(true);
    this.error.set(null);
    this.data.set(null);
    this.api.get<any>('/home').subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        if (d.seller?._id && d.seller._id !== this.auth.activeSellerId()) {
          this.loadedFor = d.seller._id;
          this.auth.setActiveSeller(d.seller._id);
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  firstName() {
    return (this.auth.user()?.name || '').split(' ')[0];
  }

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
}
