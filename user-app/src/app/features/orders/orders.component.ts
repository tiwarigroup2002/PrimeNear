import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Paged } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-orders',
  imports: [RouterLink, DatePipe, InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="My Orders" icon="bi-bag-check-fill" subtitle="Track and manage your hyperlocal orders" />
    <div class="chip-row mb-3">
      @for (t of tabs; track t.v) { <button class="chip" [class.active]="tab() === t.v" (click)="setTab(t.v)">{{ t.l }}</button> }
    </div>
    <div class="d-grid gap-3">
      @for (o of items(); track o._id) {
        <a class="card text-decoration-none text-body border-0 rounded-4 shadow-sm overflow-hidden p-3 transition-card" [routerLink]="['/orders', o._id]">
          <div class="d-flex justify-content-between align-items-start gap-2 border-bottom pb-2 mb-2">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="fw-bold text-dark fs-6">{{ o.sellerId?.shopName }}</span>
                @if (o.source === 'POS') { <span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill small"><i class="bi bi-receipt me-1"></i>In-store POS</span> }
              </div>
              <small class="text-muted d-block mt-0">Order #{{ o.orderId }} · {{ o.createdAt | date: 'd MMM y, h:mm a' }}</small>
            </div>
            <app-status-badge [status]="o.orderStatus" />
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="d-flex align-items-center gap-2 overflow-hidden flex-nowrap">
              @for (it of o.items.slice(0, 4); track $index) {
                @if (it.image) {
                  <img [src]="it.image" class="thumb thumb-sm rounded-3 shadow-xs border" alt="" />
                } @else {
                  <span class="thumb thumb-sm rounded-3 bg-light d-flex align-items-center justify-content-center text-muted border"><i class="bi bi-box"></i></span>
                }
              }
            </div>
            @if (o.items.length > 4) { <span class="small text-muted fw-semibold flex-shrink-0">+{{ o.items.length - 4 }} more</span> }
            <div class="ms-auto text-end flex-shrink-0">
              <strong class="fs-6 text-dark d-block">{{ o.finalAmount | inr }}</strong>
              <small class="text-muted d-block">
                {{ o.paymentMethod === 'Cash' ? 'Cash' : 'Online' }}
                @if (o.paymentMethod === 'Online' && o.paymentStatus === 'Pending' && o.orderStatus === 'Pending') {
                  · <span class="badge bg-warning-subtle text-warning-emphasis">Payment pending</span>
                }
              </small>
            </div>
            <i class="bi bi-chevron-right text-muted ms-1"></i>
          </div>
        </a>
      }
    </div>
    <app-state [loading]="loading()" [error]="error()" [empty]="!loading() && !error() && !items().length" icon="bi-bag-x" emptyText="No orders found in this category" />
    @if (!loading() && page < pages()) {
      <div class="text-center my-4">
        <button class="btn btn-outline-primary rounded-pill px-4 shadow-xs" (click)="more()">
          <i class="bi bi-arrow-down-circle me-1"></i>Load More Orders
        </button>
      </div>
    }
  `,
})
export class OrdersComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  tabs = [{ v: '', l: 'All' }, { v: 'active', l: 'Active' }, { v: 'completed', l: 'Delivered' }, { v: 'cancelled', l: 'Cancelled' }, { v: 'store', l: 'Store bills' }];
  tab = signal(this.route.snapshot.queryParamMap.get('tab') || '');
  items = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  page = 1;
  pages = signal(1);

  ngOnInit() {
    this.load(true);
  }

  setTab(t: string) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t || null }, replaceUrl: true });
    this.load(true);
  }

  more() {
    this.page++;
    this.load(false);
  }

  load(reset: boolean) {
    if (reset) { this.page = 1; this.items.set([]); }
    this.loading.set(true);
    this.error.set(null);
    this.api.get<Paged<any>>('/orders', { status: this.tab(), page: this.page }).subscribe({
      next: (r) => {
        this.items.set([...this.items(), ...r.items]);
        this.pages.set(r.pages);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
