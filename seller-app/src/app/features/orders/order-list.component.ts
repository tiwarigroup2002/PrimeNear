import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-order-list',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="Orders" [subtitle]="list.total() + ' orders · ' + ((list.extra()['totalAmount'] ?? 0) | inr: 0)" />
    <div class="d-flex gap-2 mb-2 overflow-auto pb-1">
      @for (t of tabs; track t[0]) {
        <button class="btn btn-sm rounded-pill text-nowrap" [class.btn-primary]="list.filters['status'] === t[0]" [class.btn-outline-secondary]="list.filters['status'] !== t[0]" (click)="list.filters['status'] = t[0]; list.apply()">
          {{ t[1] }}@if (count(t[0]); as c) { <span class="badge rounded-pill ms-1" [class.text-bg-light]="list.filters['status'] === t[0]" [class.text-bg-secondary]="list.filters['status'] !== t[0]">{{ c }}</span> }
        </button>
      }
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <div class="input-group input-group-sm" style="max-width: 360px">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input class="form-control" placeholder="Order ID, name or mobile" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" />
      </div>
      <select class="form-select form-select-sm w-auto" [(ngModel)]="list.filters['source']" (change)="list.apply()"><option value="">App & counter</option><option value="Online">App orders</option><option value="POS">Counter bills</option></select>
      <input type="date" class="form-control form-control-sm w-auto" [(ngModel)]="list.filters['from']" (change)="list.apply()" />
    </div>
    <div class="card">
      <div class="m-list">
        @for (o of list.items(); track o._id) {
          <a class="m-item" [routerLink]="['/orders', o._id]">
            <span class="thumb"><i class="bi" [class.bi-receipt]="o.source === 'POS'" [class.bi-phone]="o.source !== 'POS'"></i></span>
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold small text-truncate">{{ o.userId?.name || o.customerSnapshot?.name || 'Customer' }}</span>
              <span class="cell-sub d-block">{{ o.orderId }} · {{ o.items.length }} item(s)</span>
              <span class="cell-sub">{{ o.createdAt | date: 'd MMM, h:mm a' }} · {{ o.paymentMethod }}</span>
            </span>
            <span class="text-end"><span class="d-block fw-semibold">{{ o.finalAmount | inr: 0 }}</span><app-status-badge [status]="o.orderStatus" /></span>
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No orders here" icon="bi-bag" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class OrderListComponent implements OnInit {
  tabs = [['', 'All'], ['open', 'To do'], ['Pending', 'New'], ['Confirmed', 'Confirmed'], ['Packed', 'Packed'], ['Shipped', 'Shipped'], ['Delivered', 'Delivered'], ['Cancelled', 'Cancelled']];
  list = new PagedList<any>('/orders', { status: '', search: '', source: '', from: '' });

  ngOnInit() {
    this.list.load();
  }

  count(status: string): number {
    const c = this.list.extra()['statusCounts'] || {};
    if (status === 'open') return (c.Pending || 0) + (c.Confirmed || 0) + (c.Packed || 0) + (c.Shipped || 0);
    if (['Pending', 'Confirmed', 'Packed', 'Shipped'].includes(status)) return c[status] || 0;
    return 0;
  }
}
