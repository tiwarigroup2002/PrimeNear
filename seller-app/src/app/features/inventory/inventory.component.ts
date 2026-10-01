import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PagedList } from '../../core/utils/paged-list';
import { InrPipe, PageHeaderComponent, PaginationComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-inventory',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent],
  template: `
    <app-page-header title="Inventory" subtitle="Stock overview" />
    <app-state [loading]="!d()" />
    @if (d(); as d) {
      <div class="row g-2 mb-3 text-center">
        <div class="col-6 col-md-3"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">Products</div><div class="fs-4 fw-semibold">{{ d.totalProducts }}</div><div class="cell-sub">{{ d.units }} units</div></div></div></div>
        <div class="col-6 col-md-3"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">In stock</div><div class="fs-4 fw-semibold text-success">{{ d.inStock }}</div></div></div></div>
        <div class="col-6 col-md-3"><a routerLink="/products" [queryParams]="{ status: 'lowStock' }" class="card h-100 text-decoration-none"><div class="card-body py-2"><div class="small text-muted">Low stock</div><div class="fs-4 fw-semibold text-warning">{{ d.lowStock }}</div></div></a></div>
        <div class="col-6 col-md-3"><a routerLink="/products" [queryParams]="{ status: 'outOfStock' }" class="card h-100 text-decoration-none"><div class="card-body py-2"><div class="small text-muted">Out of stock</div><div class="fs-4 fw-semibold text-danger">{{ d.outOfStock }}</div></div></a></div>
      </div>
      <div class="card mb-3"><div class="card-body d-flex justify-content-around text-center small">
        <div><div class="text-muted">Stock value (cost)</div><div class="fw-semibold fs-6">{{ d.costValue | inr: 0 }}</div></div>
        <div><div class="text-muted">Stock value (MRP incl. GST)</div><div class="fw-semibold fs-6">{{ d.saleValue | inr: 0 }}</div></div>
      </div></div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="card h-100">
          <div class="card-header"><span class="card-title text-warning"><i class="bi bi-exclamation-triangle me-1"></i>Low stock</span></div>
          <div class="m-list">
            @for (p of d.lowStockProducts; track p._id) { <a class="m-item" [routerLink]="['/products', p._id]"><span class="flex-grow-1 small fw-semibold">{{ p.name }}</span><span class="badge text-bg-warning">{{ p.stock }} left</span></a> }
            @empty { <div class="text-center text-muted small py-3">None 👍</div> }
          </div></div></div>
        <div class="col-md-6"><div class="card h-100">
          <div class="card-header"><span class="card-title text-danger"><i class="bi bi-x-octagon me-1"></i>Out of stock</span></div>
          <div class="m-list">
            @for (p of d.outOfStockProducts; track p._id) { <a class="m-item" [routerLink]="['/products', p._id]"><span class="flex-grow-1 small fw-semibold">{{ p.name }}</span><span class="small text-primary">Restock →</span></a> }
            @empty { <div class="text-center text-muted small py-3">None 👍</div> }
          </div></div></div>
      </div>
    }
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center"><span class="card-title">Stock movements</span>
        <select class="form-select form-select-sm w-auto" [(ngModel)]="history.filters['reason']" (change)="history.apply()">
          <option value="">All</option><option value="CashBill">Counter bills</option><option value="OnlineOrder">App orders</option><option value="Added">Added</option><option value="Damage">Damage</option><option value="Return">Returns</option><option value="OrderCancelled">Cancelled orders</option><option value="Recount">Recount</option>
        </select></div>
      <div class="m-list">
        @for (m of history.items(); track m._id) {
          <div class="m-item small">
            <span class="flex-grow-1 min-w-0"><span class="d-block fw-semibold text-truncate">{{ m.productId?.name }}</span><span class="cell-sub">{{ label(m.reason) }}@if (m.note) { · {{ m.note }} } · {{ m.createdAt | date: 'd MMM, h:mm a' }}</span></span>
            <span class="text-end"><strong [class.text-success]="m.change > 0" [class.text-danger]="m.change < 0">{{ m.change > 0 ? '+' : '' }}{{ m.change }}</strong><div class="cell-sub">→ {{ m.balanceAfter }}</div></span>
          </div>
        }
      </div>
      <app-state [loading]="history.loading()" [empty]="!history.loading() && !history.items().length" emptyText="No stock movements" />
      <app-pagination [page]="history.page" [pages]="history.pages()" [total]="history.total()" [limit]="history.limit" (pageChange)="history.goTo($event)" (limitChange)="history.setLimit($event)" />
    </div>
  `,
})
export class InventoryComponent implements OnInit {
  private api = inject(ApiService);
  d = signal<any>(null);
  history = new PagedList<any>('/inventory/history', { reason: '' }, false);
  labels: Record<string, string> = { CashBill: 'Counter bill', OnlineOrder: 'App order', Added: 'Stock added', Damage: 'Damaged', Return: 'Return', Recount: 'Recount', OrderCancelled: 'Order cancelled', Adjustment: 'Adjustment' };

  ngOnInit() {
    this.api.get<any>('/inventory').subscribe((d) => this.d.set(d));
    this.history.load();
  }

  label(r: string) {
    return this.labels[r] || r;
  }
}
