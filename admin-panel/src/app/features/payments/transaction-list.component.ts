import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { EntitySelectComponent, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-transaction-list',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, EntitySelectComponent],
  template: `
    <app-page-header title="Transactions" icon="bi-receipt" back="/payments" backLabel="Payments" [subtitle]="list.total() + ' transactions · net ' + ((list.extra()['totalAmount'] ?? 0) | inr)" />
    <div class="card">
      <div class="filter-bar">
        <div class="input-group input-group-sm search"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Transaction / Razorpay / Order ID" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" /></div>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['type']" (change)="list.apply()"><option value="">Payments & refunds</option><option value="Payment">Payments</option><option value="Refund">Refunds</option></select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['status']" (change)="list.apply()"><option value="">Any status</option><option>Success</option><option>Failed</option><option>Pending</option></select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['method']" (change)="list.apply()"><option value="">Online & cash</option><option>Online</option><option>Cash</option></select>
        <div style="min-width: 200px"><app-entity-select kind="seller" placeholder="Seller..." [small]="true" (selected)="list.filters['seller'] = $event?._id || ''; list.apply()" /></div>
        <input type="date" class="form-control form-control-sm" [(ngModel)]="list.filters['from']" (change)="list.apply()" />
        <input type="date" class="form-control form-control-sm" [(ngModel)]="list.filters['to']" (change)="list.apply()" />
      </div>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>Transaction ID</th><th>Order</th><th>User</th><th>Seller</th><th>Type</th><th>Method</th><th class="text-end">Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            @for (t of list.items(); track t._id) {
              <tr>
                <td><code class="ref">{{ t.transactionId }}</code>@if (t.razorpayPaymentId) { <div class="cell-sub">{{ t.razorpayPaymentId }}</div> }</td>
                <td>@if (t.orderId) { <a [routerLink]="['/orders', t.orderId._id]">{{ t.orderId.orderId }}</a> } @else { — }</td>
                <td>{{ t.userId?.name || '—' }}<div class="cell-sub">{{ t.userId?.mobileNumber }}</div></td>
                <td>{{ t.sellerId?.shopName }}</td>
                <td>{{ t.type }}</td>
                <td>{{ t.method }}@if (t.gatewayMethod) { <div class="cell-sub">{{ t.gatewayMethod }}</div> }</td>
                <td class="text-end fw-semibold" [class.text-danger]="t.type === 'Refund'">{{ t.type === 'Refund' ? '-' : '' }}{{ t.amount | inr }}</td>
                <td><app-status-badge [status]="t.status" />@if (t.failureReason) { <div class="cell-sub text-danger">{{ t.failureReason }}</div> }</td>
                <td class="small text-nowrap">{{ t.createdAt | date: 'd MMM y, h:mm a' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No transactions" icon="bi-receipt" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class TransactionListComponent implements OnInit {
  list = new PagedList<any>('/payments', { search: '', type: '', status: '', method: '', seller: '', from: '', to: '' });
  ngOnInit() {
    this.list.load();
  }
}
