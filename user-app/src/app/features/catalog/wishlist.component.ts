import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CartService } from '../../core/services/cart.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-wishlist',
  imports: [RouterLink, InrPipe, PageHeaderComponent, StateComponent],
  template: `
    <app-page-header title="My Wishlist" icon="bi-heart-fill" [subtitle]="items().length ? items().length + ' item(s) saved for later' : ''" />
    <app-state [loading]="loading()" [error]="error()" [empty]="!loading() && !error() && !items().length" icon="bi-heart" emptyText="Your wishlist is empty. Tap the ♡ on any item to save it here!" />
    @if (items().length) {
      <div class="card border-0 rounded-4 shadow-sm overflow-hidden"><div class="m-list">
        @for (w of items(); track w.product._id) {
          <div class="m-item p-3 d-flex align-items-center gap-3">
            <a [routerLink]="['/product', w.product._id]" class="flex-shrink-0">
              @if (w.product.images[0]) {
                <img [src]="w.product.images[0]" class="thumb rounded-3 shadow-xs border" alt="" />
              } @else {
                <span class="thumb rounded-3 bg-light d-flex align-items-center justify-content-center text-muted border"><i class="bi bi-image"></i></span>
              }
            </a>
            <div class="flex-grow-1 min-w-0">
              <a [routerLink]="['/product', w.product._id]" class="text-body text-decoration-none fw-bold line-clamp-2">{{ w.product.name }}</a>
              <div class="small text-muted text-truncate mt-1"><i class="bi bi-shop me-1 text-primary"></i>{{ w.shopName }}</div>
              <div class="mt-1">
                <strong class="fs-6 text-dark">{{ w.product.finalPrice | inr: 0 }}</strong>
                @if (w.priceDrop) { <span class="badge bg-success-subtle text-success-emphasis rounded-pill ms-2"><i class="bi bi-arrow-down"></i> {{ w.priceDrop | inr: 0 }} price drop</span> }
              </div>
              @if (!w.product.inStock) { <small class="text-danger fw-semibold d-block mt-1">Currently Out of stock</small> }
            </div>
            <div class="d-flex flex-column gap-2 flex-shrink-0">
              <button class="btn btn-sm btn-primary rounded-pill px-3 shadow-xs" [disabled]="!w.product.inStock || busy() === w.product._id" (click)="moveToCart(w)" aria-label="Move to cart">
                <i class="bi bi-cart-plus me-1"></i>Add
              </button>
              <button class="btn btn-sm btn-light border text-danger rounded-pill shadow-xs" (click)="remove(w)" aria-label="Remove">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </div>
        }
      </div></div>
    }
  `,
})
export class WishlistComponent implements OnInit {
  private api = inject(ApiService);
  private cart = inject(CartService);
  private router = inject(Router);
  private toast = inject(ToastService);
  items = signal<any[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal<string | null>(null);

  ngOnInit() {
    this.api.get<{ items: any[] }>('/wishlist').subscribe({
      next: (r) => { this.items.set(r.items); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  remove(w: any, silent = false) {
    this.items.set(this.items().filter((x) => x !== w));
    this.api.delete(`/wishlist/${w.product._id}`).subscribe({ next: () => !silent && this.toast.info('Removed from wishlist'), error: () => {} });
  }

  moveToCart(w: any) {
    // Products with colours / sizes: choose one on the product page first
    if (w.product.variants?.length) {
      this.router.navigate(['/product', w.product._id]);
      return;
    }
    this.busy.set(w.product._id);
    this.cart.add(w.product._id).subscribe({
      next: () => { this.busy.set(null); this.toast.success('Moved to cart'); this.remove(w, true); },
      error: (e) => { this.busy.set(null); this.toast.error(errorMessage(e)); },
    });
  }
}
