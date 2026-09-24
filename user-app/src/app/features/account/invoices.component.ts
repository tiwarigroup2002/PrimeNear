import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { InrPipe, PageHeaderComponent, PaginationComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-invoices',
  imports: [DatePipe, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent],
  template: `
    <app-page-header title="My invoices" icon="bi-receipt" subtitle="GST bills for your delivered orders and store purchases" />
    <div class="card">
      <div class="m-list">
        @for (i of list.items(); track i._id) {
          <a class="m-item" [routerLink]="['/invoices', i._id]">
            <span class="thumb thumb-sm"><i class="bi bi-receipt"></i></span>
            <span class="flex-grow-1 min-w-0"><span class="d-block fw-semibold small">{{ i.invoiceId }}</span><small class="text-muted">{{ i.sellerId?.shopName }} · {{ i.invoiceDate | date: 'd MMM y' }}</small></span>
            <strong>{{ i.totalAmount | inr }}</strong>
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="Invoices appear here after your orders are delivered" icon="bi-receipt" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class InvoicesComponent implements OnInit {
  list = new PagedList<any>('/invoices', {}, false);
  ngOnInit() {
    this.list.load();
  }
}
