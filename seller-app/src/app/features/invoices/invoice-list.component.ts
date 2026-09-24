import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { InrPipe, PageHeaderComponent, PaginationComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-invoice-list',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent],
  template: `
    <app-page-header title="Invoices" [subtitle]="list.total() + ' bills · ' + ((list.extra()['totalAmount'] ?? 0) | inr: 0)">
      <a routerLink="/billing" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>New bill</a>
    </app-page-header>
    <div class="input-group mb-2">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input class="form-control" placeholder="Invoice no., customer name or mobile" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" />
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <select class="form-select form-select-sm w-auto" [(ngModel)]="list.filters['paymentMethod']" (change)="list.apply()"><option value="">Cash & online</option><option value="Cash">Cash</option><option value="Online">Online</option></select>
      <input type="date" class="form-control form-control-sm w-auto" [(ngModel)]="list.filters['from']" (change)="list.apply()" />
      <input type="date" class="form-control form-control-sm w-auto" [(ngModel)]="list.filters['to']" (change)="list.apply()" />
    </div>
    <div class="card">
      <div class="m-list">
        @for (i of list.items(); track i._id) {
          <a class="m-item" [routerLink]="['/invoices', i._id]">
            <span class="thumb"><i class="bi bi-file-earmark-text"></i></span>
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold small text-truncate">{{ i.customerSnapshot?.name || 'Walk-in customer' }}</span>
              <span class="cell-sub">{{ i.invoiceId }} · {{ i.invoiceDate | date: 'd MMM y, h:mm a' }}</span>
            </span>
            <span class="text-end"><span class="d-block fw-semibold">{{ i.totalAmount | inr }}</span><span class="cell-sub">{{ i.paymentMethod }}@if (i.orderId?.source === 'Online') { · app order }</span></span>
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No invoices yet" icon="bi-file-earmark-text" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class InvoiceListComponent implements OnInit {
  list = new PagedList<any>('/invoices', { search: '', paymentMethod: '', from: '', to: '' });
  ngOnInit() {
    this.list.load();
  }
}
