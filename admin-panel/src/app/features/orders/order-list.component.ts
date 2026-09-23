import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { Order } from '../../core/models/api.models';
import { downloadCsv } from '../../core/utils/csv';
import { ApiService } from '../../core/services/api.service';
import { EntitySelectComponent, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

export const ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];

@Component({
  selector: 'app-order-list',
  imports: [FormsModule, RouterLink, DatePipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, EntitySelectComponent],
  templateUrl: './order-list.component.html',
})
export class OrderListComponent implements OnInit {
  private api = inject(ApiService);
  statuses = ORDER_STATUSES;
  defaults = { search: '', status: '', paymentStatus: '', paymentMethod: '', source: '', seller: '', from: '', to: '', sortBy: 'date', sortDir: 'desc' };
  list = new PagedList<Order>('/orders', this.defaults);

  ngOnInit() {
    this.list.load();
  }

  sort(field: string) {
    if (this.list.filters['sortBy'] === field) this.list.filters['sortDir'] = this.list.filters['sortDir'] === 'asc' ? 'desc' : 'asc';
    else {
      this.list.filters['sortBy'] = field;
      this.list.filters['sortDir'] = 'desc';
    }
    this.list.apply();
  }

  sortIcon(field: string) {
    if (this.list.filters['sortBy'] !== field) return 'bi-arrow-down-up opacity-25';
    return this.list.filters['sortDir'] === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
  }

  statusTab(s: string) {
    this.list.filters['status'] = s;
    this.list.apply();
  }

  /** Exports every matching order (not just this page). */
  export() {
    this.api.get<any>('/orders', { ...this.list.filters, page: 1, limit: 200 }).subscribe((r) =>
      downloadCsv('orders.csv', ['Order ID', 'Date', 'Customer', 'Mobile', 'Seller', 'Amount', 'Refunded', 'Payment', 'Payment status', 'Order status', 'Source'],
        r.items.map((o: Order) => [o.orderId, o.createdAt, o.userId?.name || o.customerSnapshot?.name, o.userId?.mobileNumber || o.customerSnapshot?.mobileNumber, o.sellerId?.shopName, o.finalAmount, o.refundedAmount, o.paymentMethod, o.paymentStatus, o.orderStatus, o.source]))
    );
  }
}
