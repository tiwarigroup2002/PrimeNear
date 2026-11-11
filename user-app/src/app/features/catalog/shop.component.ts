import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Paged } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StarsComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-shop',
  imports: [DatePipe, InrPipe, PageHeaderComponent, StarsComponent, StateComponent],
  template: `
    <app-page-header title="Store Profile" back="/home" backLabel="Home" />
    <app-state [loading]="loading()" [error]="error()" />
    @if (s(); as s) {
      <div class="card mb-4 border-0 rounded-4 shadow-sm overflow-hidden">
        <div class="p-4" style="background: var(--pn-gradient-hero); color: #fff;">
          <div class="d-flex align-items-center gap-3">
            @if (s.shopImage) {
              <img [src]="s.shopImage" class="shop-thumb shadow-sm" style="width:72px;height:72px; border: 3px solid rgba(255,255,255,0.9);" alt="" />
            } @else {
              <span class="shop-thumb shop-thumb-icon shadow-sm" style="width:72px;height:72px; font-size: 2rem; border: 3px solid rgba(255,255,255,0.9); background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); color: #fff;"><i class="bi bi-shop"></i></span>
            }
            <div class="min-w-0 flex-grow-1">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <h1 class="h4 fw-bold mb-0 text-white">{{ s.shopName }}</h1>
                <span class="badge rounded-pill bg-white text-primary small fw-bold"><i class="bi bi-patch-check-fill me-1"></i>Verified Local Store</span>
              </div>
              <div class="small text-white-50 mt-1">{{ s.ownerName }}@if (s.tahsil) { · <i class="bi bi-geo-alt-fill"></i> {{ s.tahsil }} }</div>
              @if (s.ratingCount) {
                <div class="small mt-1 d-flex align-items-center gap-2">
                  <span class="badge bg-warning text-dark fw-bold rounded-pill"><i class="bi bi-star-fill me-1"></i>{{ s.rating }}</span>
                  <span class="text-white-50">({{ s.ratingCount }} reviews)</span>
                </div>
              }
            </div>
          </div>
        </div>

        <div class="card-body p-4 bg-white">
          <div class="row text-center g-0 border rounded-4 py-2 mb-3 bg-body-tertiary">
            <div class="col stat-mini border-end"><strong class="fs-5 d-block text-dark">{{ s.productCount }}</strong><small class="text-muted fw-semibold">Products</small></div>
            <div class="col stat-mini border-end"><strong class="fs-5 d-block text-dark">{{ s.totalOrders }}</strong><small class="text-muted fw-semibold">Orders Delivered</small></div>
            <div class="col stat-mini"><strong class="fs-5 d-block text-dark">{{ s.rating || '–' }}</strong><small class="text-muted fw-semibold">Rating</small></div>
          </div>

          <dl class="dl-grid small mb-3">
            @if (s.shopAddress) { <dt>Address</dt><dd class="fw-medium">{{ s.shopAddress }}</dd> }
            @if (s.deliveryArea?.length) {
              <dt>Delivery Coverage</dt>
              <dd>
                @for (r of s.deliveryArea; track r.district) { <div class="fw-medium">{{ r.district }}: {{ r.talukas }}</div> }
                <small class="text-muted">Direct home delivery to PIN codes in these regions.</small>
              </dd>
            }
            <dt>Home Delivery</dt>
            <dd>
              @if (s.delivery) {
                <span class="text-success fw-bold"><i class="bi bi-check-circle-fill me-1"></i>Available</span> · {{ s.deliveryCharge ? (s.deliveryCharge | inr: 0) : 'Free delivery' }}@if (s.freeDeliveryAbove && s.deliveryCharge) { (free above {{ s.freeDeliveryAbove | inr: 0 }}) }
              } @else {
                <span class="text-secondary">Store pickup only</span>
              }
            </dd>
            <dt>Cash on Delivery</dt>
            <dd>{{ s.cod ? 'Supported (Cash / UPI)' : 'Prepaid online only' }}</dd>
            @if (s.gstNumber) { <dt>GSTIN</dt><dd class="font-monospace">{{ s.gstNumber }}</dd> }
          </dl>

          <div class="d-flex gap-2">
            @if (s.mobileNumber) {
              <a class="btn btn-outline-primary flex-grow-1 rounded-pill py-2 shadow-xs" [href]="'tel:+91' + s.mobileNumber">
                <i class="bi bi-telephone-fill me-2"></i>Call Store
              </a>
            }
            @if (s._id !== auth.activeSellerId()) {
              <button class="btn btn-primary flex-grow-1 rounded-pill py-2 shadow-sm" (click)="shopHere()">
                <i class="bi bi-bag-check-fill me-2"></i>Make Active Store
              </button>
            }
          </div>
        </div>
      </div>

      <div class="section-title mt-4"><h2>Customer Reviews</h2></div>
      <div class="card border-0 rounded-4 shadow-sm overflow-hidden"><div class="m-list">
        @for (r of reviews(); track r._id) {
          <div class="m-item d-block p-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <app-stars [value]="r.rating" />
              <small class="text-muted">{{ r.createdAt | date: 'd MMM y' }}</small>
            </div>
            @if (r.productId?.name) { <div class="small text-muted fw-semibold">Product: {{ r.productId.name }}</div> }
            @if (r.reviewText) { <p class="mb-1 mt-1 small text-secondary">{{ r.reviewText }}</p> }
            @if (r.images?.length) {
              <div class="d-flex gap-2 mb-2">
                @for (i of r.images; track i) { <img [src]="i" class="review-img rounded-3 shadow-xs border" style="width: 56px; height: 56px; object-fit: cover;" alt="" /> }
              </div>
            }
            <small class="text-muted"><i class="bi bi-person-fill text-success me-1"></i>{{ r.userId?.name || 'Verified Customer' }}</small>
          </div>
        }
        @if (!reviews().length) {
          <div class="p-4 text-center text-muted small">No customer reviews yet for this store.</div>
        }
      </div></div>
      @if (page < pages()) {
        <div class="text-center my-4">
          <button class="btn btn-sm btn-outline-primary rounded-pill px-4 shadow-xs" (click)="moreReviews()">
            <i class="bi bi-arrow-down-circle me-1"></i>Load More Reviews
          </button>
        </div>
      }
    }
  `,
})
export class ShopComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cart = inject(CartService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  auth = inject(AuthService);
  id = this.route.snapshot.paramMap.get('id')!;
  s = signal<any>(null);
  reviews = signal<any[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  page = 1;
  pages = signal(1);

  ngOnInit() {
    this.api.get<any>(`/sellers/${this.id}/profile`).subscribe({
      next: (s) => { this.s.set(s); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
    this.loadReviews();
  }

  loadReviews() {
    this.api.get<Paged<any>>(`/sellers/${this.id}/reviews`, { page: this.page }).subscribe({
      next: (r) => { this.reviews.set([...this.reviews(), ...r.items]); this.pages.set(r.pages); },
      error: () => {},
    });
  }

  moreReviews() {
    this.page++;
    this.loadReviews();
  }

  async shopHere() {
    if (this.cart.count() && !(await this.confirm.confirm('Switch shop?', 'Your cart will be emptied because it has items from the current shop.', 'warning', 'Switch'))) return;
    this.api.post<any>('/sellers/switch', { sellerId: this.id }).subscribe({
      next: (r) => {
        this.auth.setActiveSeller(this.id);
        if (r.data.cartCleared) this.cart.reset(0);
        this.toast.success(r.message || 'Shop switched');
        this.router.navigate(['/home']);
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
