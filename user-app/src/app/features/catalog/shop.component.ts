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
    <app-page-header title="Shop details" back="/home" backLabel="Home" />
    <app-state [loading]="loading()" [error]="error()" />
    @if (s(); as s) {
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex align-items-center gap-3 mb-3">
          @if (s.shopImage) { <img [src]="s.shopImage" class="shop-thumb" style="width:64px;height:64px" alt="" /> } @else { <span class="shop-thumb shop-thumb-icon" style="width:64px;height:64px"><i class="bi bi-shop"></i></span> }
          <div class="min-w-0">
            <h1 class="h5 fw-bold mb-0">{{ s.shopName }}</h1>
            <div class="small text-muted">{{ s.ownerName }}@if (s.tahsil) { · {{ s.tahsil }} }</div>
            @if (s.ratingCount) { <div class="small"><app-stars [value]="s.rating" /> {{ s.rating }} ({{ s.ratingCount }} reviews)</div> }
          </div>
        </div>
        <div class="row text-center g-0 border rounded-3 mb-3">
          <div class="col stat-mini border-end"><strong>{{ s.productCount }}</strong><small>Products</small></div>
          <div class="col stat-mini border-end"><strong>{{ s.totalOrders }}</strong><small>Orders delivered</small></div>
          <div class="col stat-mini"><strong>{{ s.rating || '–' }}</strong><small>Rating</small></div>
        </div>
        <dl class="dl-grid small">
          @if (s.shopAddress) { <dt>Address</dt><dd>{{ s.shopAddress }}</dd> }
          <dt>Delivery</dt><dd>@if (s.delivery) { Home delivery · {{ s.deliveryCharge ? (s.deliveryCharge | inr: 0) : 'Free' }}@if (s.freeDeliveryAbove && s.deliveryCharge) { (free above {{ s.freeDeliveryAbove | inr: 0 }}) } } @else { Store pickup only }</dd>
          <dt>Cash on delivery</dt><dd>{{ s.cod ? 'Available' : 'Not available' }}</dd>
          @if (s.gstNumber) { <dt>GSTIN</dt><dd>{{ s.gstNumber }}</dd> }
        </dl>
        <div class="d-flex gap-2 mt-3">
          @if (s.mobileNumber) { <a class="btn btn-outline-primary flex-grow-1" [href]="'tel:+91' + s.mobileNumber"><i class="bi bi-telephone me-1"></i>Call shop</a> }
          @if (s._id !== auth.activeSellerId()) { <button class="btn btn-primary flex-grow-1" (click)="shopHere()"><i class="bi bi-bag me-1"></i>Shop here</button> }
        </div>
      </div></div>

      <h2 class="h6 fw-semibold">Customer reviews</h2>
      <div class="card"><div class="m-list">
        @for (r of reviews(); track r._id) {
          <div class="m-item d-block">
            <div class="d-flex justify-content-between"><app-stars [value]="r.rating" /><small class="text-muted">{{ r.createdAt | date: 'd MMM y' }}</small></div>
            @if (r.productId?.name) { <div class="small text-muted">on {{ r.productId.name }}</div> }
            @if (r.reviewText) { <p class="mb-1 mt-1 small">{{ r.reviewText }}</p> }
            @if (r.images?.length) { <div class="d-flex gap-2 mb-1">@for (i of r.images; track i) { <img [src]="i" class="review-img" alt="" /> }</div> }
            <small class="text-muted">{{ r.userId?.name || 'Customer' }}</small>
          </div>
        }
        @if (!reviews().length) { <div class="m-item text-muted small">No reviews yet</div> }
      </div></div>
      @if (page < pages()) { <div class="text-center my-3"><button class="btn btn-sm btn-outline-primary" (click)="moreReviews()">More reviews</button></div> }
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
