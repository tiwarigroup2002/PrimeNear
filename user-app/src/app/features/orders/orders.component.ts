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
    <app-page-header title="My orders" icon="bi-bag-check" />
    <div class="chip-row mb-3">
      @for (t of tabs; track t.v) { <button class="chip" [class.active]="tab() === t.v" (click)="setTab(t.v)">{{ t.l }}</button> }
    </div>
    <div class="d-grid gap-2">
      @for (o of items(); track o._id) {
        <a class="card card-body text-decoration-none text-body py-3" [routerLink]="['/orders', o._id]">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="min-w-0">
              <div class="fw-semibold">{{ o.sellerId?.shopName }}</div>
              <small class="text-muted">{{ o.orderId }} · {{ o.createdAt | date: 'd MMM y, h:mm a' }}</small>
            </div>
            <app-status-badge [status]="o.orderStatus" />
          </div>
          <div class="d-flex align-items-center gap-2 mt-2">
            @for (it of o.items.slice(0, 4); track $index) {
              @if (it.image) { <img [src]="it.image" class="thumb thumb-sm" alt="" /> } @else { <span class="thumb thumb-sm"><i class="bi bi-box"></i></span> }
            }
            @if (o.items.length > 4) { <span class="small text-muted">+{{ o.items.length - 4 }}</span> }
            <span class="ms-auto text-end"><strong>{{ o.finalAmount | inr }}</strong><small class="d-block text-muted">{{ o.paymentMethod === 'Cash' ? 'Cash' : 'Online' }}@if (o.paymentMethod === 'Online' && o.paymentStatus === 'Pending' && o.orderStatus === 'Pending') { · <span class="text-danger">Payment pending</span> }</small></span>
          </div>
          @if (o.source === 'POS') { <small class="text-muted mt-1"><i class="bi bi-receipt"></i> Bought at the store</small> }
        </a>
      }
    </div>
    <app-state [loading]="loading()" [error]="error()" [empty]="!loading() && !error() && !items().length" icon="bi-bag" emptyText="No orders here yet" />
    @if (!loading() && page < pages()) { <div class="text-center my-3"><button class="btn btn-outline-primary" (click)="more()">Load more</button></div> }
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
