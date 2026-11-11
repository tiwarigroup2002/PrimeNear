import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { InrPipe } from '../../shared';

@Component({
  selector: 'app-account',
  imports: [RouterLink, InrPipe],
  template: `
    <!-- Profile Card with ambient gradient -->
    <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
      <div class="p-4" style="background: var(--pn-gradient-hero); color: #fff; position: relative;">
        <div class="d-flex align-items-center gap-3">
          @if (auth.user()?.profileImage) {
            <img [src]="auth.user()!.profileImage" class="avatar shadow-sm" style="width: 64px; height: 64px; border: 3px solid rgba(255,255,255,0.9);" alt="" />
          } @else {
            <span class="avatar avatar-initials shadow-sm" style="width: 64px; height: 64px; font-size: 1.4rem; border: 3px solid rgba(255,255,255,0.9); background: rgba(255,255,255,0.25); backdrop-filter: blur(8px);">{{ initials() }}</span>
          }
          <div class="flex-grow-1 min-w-0">
            <h1 class="h5 fw-bold mb-1 text-truncate">{{ auth.user()?.name || 'Hello Shopper!' }}</h1>
            <div class="small text-white-50"><i class="bi bi-telephone-fill me-1"></i>+91 {{ auth.user()?.mobileNumber }}</div>
            @if (auth.user()?.email) { <div class="small text-white-50 text-truncate"><i class="bi bi-envelope-fill me-1"></i>{{ auth.user()?.email }}</div> }
          </div>
          <a routerLink="/account/profile" class="btn btn-sm btn-light rounded-pill px-3 shadow-xs fw-semibold">
            <i class="bi bi-pencil-fill me-1 small"></i>Edit
          </a>
        </div>
      </div>
      @if (stats(); as s) {
        <div class="card-body bg-white py-3">
          <div class="row text-center g-0">
            <div class="col stat-mini border-end">
              <strong class="fs-5 text-dark d-block">{{ s.totalOrders }}</strong>
              <small class="text-muted fw-semibold">Orders</small>
            </div>
            <div class="col stat-mini border-end">
              <strong class="fs-5 text-dark d-block">{{ s.totalSpent | inr: 0 }}</strong>
              <small class="text-muted fw-semibold">Total Spent</small>
            </div>
            <div class="col stat-mini">
              <strong class="fs-5 text-dark d-block">{{ auth.shops().length }}</strong>
              <small class="text-muted fw-semibold">My Stores</small>
            </div>
          </div>
        </div>
      }
    </div>

    <!-- Quick Action Navigation Grid -->
    <div class="row g-2 mb-3">
      <div class="col-4">
        <a routerLink="/orders" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(215, 15, 100, 0.1); color: var(--pn-primary);">
            <i class="bi bi-bag-check-fill fs-5"></i>
          </div>
          <span class="small fw-bold">My Orders</span>
        </a>
      </div>
      <div class="col-4">
        <a routerLink="/wishlist" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(239, 68, 68, 0.1); color: #ef4444;">
            <i class="bi bi-heart-fill fs-5"></i>
          </div>
          <span class="small fw-bold">Wishlist</span>
        </a>
      </div>
      <div class="col-4">
        <a routerLink="/account/addresses" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(16, 185, 129, 0.1); color: #10b981;">
            <i class="bi bi-geo-alt-fill fs-5"></i>
          </div>
          <span class="small fw-bold">Addresses</span>
        </a>
      </div>
      <div class="col-4">
        <a routerLink="/invoices" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">
            <i class="bi bi-receipt-cutoff fs-5"></i>
          </div>
          <span class="small fw-bold">Invoices</span>
        </a>
      </div>
      <div class="col-4">
        <a routerLink="/notifications" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(245, 158, 11, 0.1); color: #f59e0b;">
            <i class="bi bi-bell-fill fs-5"></i>
          </div>
          <span class="small fw-bold">Alerts</span>
        </a>
      </div>
      <div class="col-4">
        <a routerLink="/support" class="card p-3 text-center text-decoration-none text-dark border-0 rounded-4 shadow-xs h-100 d-flex flex-column align-items-center justify-content-center">
          <div class="rounded-circle d-flex align-items-center justify-content-center mb-2" style="width: 44px; height: 44px; background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
            <i class="bi bi-headset fs-5"></i>
          </div>
          <span class="small fw-bold">Help Desk</span>
        </a>
      </div>
    </div>

    <!-- Account Details List -->
    <div class="card mb-3 border-0 rounded-4 shadow-sm overflow-hidden">
      <div class="m-list">
        <a class="m-item py-3 px-3" routerLink="/account/profile">
          <div class="d-inline-flex align-items-center justify-content-center rounded-3 bg-light p-2 text-primary me-2" style="width: 36px; height: 36px;">
            <i class="bi bi-person-fill"></i>
          </div>
          <span class="flex-grow-1 fw-semibold text-dark">Profile Details</span>
          <i class="bi bi-chevron-right text-muted small"></i>
        </a>
        <a class="m-item py-3 px-3" routerLink="/account/settings">
          <div class="d-inline-flex align-items-center justify-content-center rounded-3 bg-light p-2 text-primary me-2" style="width: 36px; height: 36px;">
            <i class="bi bi-gear-fill"></i>
          </div>
          <span class="flex-grow-1 fw-semibold text-dark">Settings & Preferences</span>
          <i class="bi bi-chevron-right text-muted small"></i>
        </a>
        @if (auth.activeShop(); as s) {
          <a class="m-item py-3 px-3" [routerLink]="['/shop', s._id]">
            <div class="d-inline-flex align-items-center justify-content-center rounded-3 bg-light p-2 text-primary me-2" style="width: 36px; height: 36px;">
              <i class="bi bi-shop"></i>
            </div>
            <span class="flex-grow-1 fw-semibold text-dark">About {{ s.shopName }}</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </a>
        }
        <a class="m-item py-3 px-3" routerLink="/orders" [queryParams]="{ tab: 'store' }">
          <div class="d-inline-flex align-items-center justify-content-center rounded-3 bg-light p-2 text-primary me-2" style="width: 36px; height: 36px;">
            <i class="bi bi-receipt"></i>
          </div>
          <span class="flex-grow-1 fw-semibold text-dark">Store Visit Bills (POS)</span>
          <i class="bi bi-chevron-right text-muted small"></i>
        </a>
        <button class="m-item py-3 px-3 text-danger border-0 bg-transparent w-100 text-start" (click)="logout()">
          <div class="d-inline-flex align-items-center justify-content-center rounded-3 bg-danger-subtle p-2 text-danger me-2" style="width: 36px; height: 36px;">
            <i class="bi bi-box-arrow-right"></i>
          </div>
          <span class="flex-grow-1 fw-semibold">Sign Out</span>
        </button>
      </div>
    </div>
    <div class="text-center py-2 text-muted small">
      <i class="bi bi-shield-check text-success me-1"></i>{{ cfg.config().platformName }} · Shop trusted neighbourhood stores
    </div>
  `,
})
export class AccountComponent implements OnInit {
  auth = inject(AuthService);
  cfg = inject(AppConfigService);
  private api = inject(ApiService);
  private confirm = inject(ConfirmService);
  stats = signal<any>(null);
  initials = computed(() => (this.auth.user()?.name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase());

  ngOnInit() {
    this.api.get<any>('/dashboard').subscribe({ next: (d) => this.stats.set(d.stats), error: () => {} });
  }

  async logout() {
    if (await this.confirm.confirm('Logout?', 'You will need an OTP to log in again.', 'warning', 'Logout')) this.auth.logout();
  }
}
