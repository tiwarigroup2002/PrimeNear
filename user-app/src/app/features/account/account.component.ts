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
    <div class="card mb-3"><div class="card-body">
      <div class="profile-head">
        @if (auth.user()?.profileImage) { <img [src]="auth.user()!.profileImage" class="avatar" alt="" /> } @else { <span class="avatar avatar-initials">{{ initials() }}</span> }
        <div class="flex-grow-1 min-w-0">
          <div class="fw-bold fs-5 text-truncate">{{ auth.user()?.name || 'Hello!' }}</div>
          <div class="text-muted small">+91 {{ auth.user()?.mobileNumber }}</div>
          @if (auth.user()?.email) { <div class="text-muted small text-truncate">{{ auth.user()?.email }}</div> }
        </div>
        <a routerLink="/account/profile" class="btn btn-sm btn-outline-primary">Edit</a>
      </div>
      @if (stats(); as s) {
        <div class="row text-center g-0 border rounded-3 mt-3">
          <div class="col stat-mini border-end"><strong>{{ s.totalOrders }}</strong><small>Orders</small></div>
          <div class="col stat-mini border-end"><strong>{{ s.totalSpent | inr: 0 }}</strong><small>Total spent</small></div>
          <div class="col stat-mini"><strong>{{ auth.shops().length }}</strong><small>My shops</small></div>
        </div>
      }
    </div></div>

    <div class="menu-grid mb-3">
      <a routerLink="/orders"><i class="bi bi-bag-check"></i>Orders</a>
      <a routerLink="/wishlist"><i class="bi bi-heart"></i>Wishlist</a>
      <a routerLink="/account/addresses"><i class="bi bi-geo-alt"></i>Addresses</a>
      <a routerLink="/invoices"><i class="bi bi-receipt"></i>Invoices</a>
      <a routerLink="/notifications"><i class="bi bi-bell"></i>Notifications</a>
      <a routerLink="/support"><i class="bi bi-life-preserver"></i>Help</a>
    </div>

    <div class="card mb-3"><div class="m-list">
      <a class="m-item" routerLink="/account/profile"><i class="bi bi-person fs-5 text-primary"></i><span class="flex-grow-1">Edit profile</span><i class="bi bi-chevron-right text-muted"></i></a>
      <a class="m-item" routerLink="/account/settings"><i class="bi bi-gear fs-5 text-primary"></i><span class="flex-grow-1">Settings & notifications</span><i class="bi bi-chevron-right text-muted"></i></a>
      @if (auth.activeShop(); as s) { <a class="m-item" [routerLink]="['/shop', s._id]"><i class="bi bi-shop fs-5 text-primary"></i><span class="flex-grow-1">About {{ s.shopName }}</span><i class="bi bi-chevron-right text-muted"></i></a> }
      <a class="m-item" routerLink="/orders" [queryParams]="{ tab: 'store' }"><i class="bi bi-receipt-cutoff fs-5 text-primary"></i><span class="flex-grow-1">Bills from store visits</span><i class="bi bi-chevron-right text-muted"></i></a>
      <button class="m-item text-danger" (click)="logout()"><i class="bi bi-box-arrow-right fs-5"></i><span class="flex-grow-1">Logout</span></button>
    </div></div>
    <p class="text-center small text-muted">{{ cfg.config().platformName }} · shop local, trusted stores</p>
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
