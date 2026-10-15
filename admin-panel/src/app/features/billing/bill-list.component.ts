import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { CanDirective, EntitySelectComponent, InrPipe, PageHeaderComponent, PaginationComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-bill-list',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, EntitySelectComponent, StatCardComponent, CanDirective],
  template: `
    <app-page-header title="Subscription bills" icon="bi-receipt-cutoff" [subtitle]="list.total() + ' bills · made by hand for sellers'">
      <ng-container *appCan="'billing.manage'">
        <a class="btn btn-sm btn-outline-secondary" routerLink="/subscription-bills/design"><i class="bi bi-palette me-1"></i>Bill design</a>
        <a class="btn btn-sm btn-primary" routerLink="/subscription-bills/new"><i class="bi bi-plus-lg me-1"></i>New bill</a>
      </ng-container>
    </app-page-header>

    <div class="row g-3 mb-3">
      <div class="col-sm-4"><app-stat-card label="Outstanding (issued, unpaid)" [value]="(sum()['outstanding'] ?? 0) | inr" icon="bi-hourglass-split" color="warning" [hint]="(sum()['outstandingCount'] ?? 0) + ' bills'" /></div>
      <div class="col-sm-4"><app-stat-card label="Received" [value]="(sum()['paid'] ?? 0) | inr" icon="bi-check2-circle" color="success" [hint]="(sum()['paidCount'] ?? 0) + ' bills'" /></div>
      <div class="col-sm-4"><app-stat-card label="Drafts" [value]="sum()['draftCount'] ?? 0" icon="bi-pencil-square" color="secondary" hint="Not sent to sellers yet" /></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <div class="input-group input-group-sm search"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Bill no. / shop / plan" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" /></div>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['status']" (change)="list.apply()">
          <option value="">Any status</option><option>Draft</option><option>Issued</option><option>Paid</option><option>Cancelled</option>
        </select>
        <div style="min-width: 200px"><app-entity-select kind="seller" placeholder="Seller..." [small]="true" (selected)="list.filters['sellerId'] = $event?._id || ''; list.apply()" /></div>
        <input type="date" class="form-control form-control-sm" title="Bill date from" [(ngModel)]="list.filters['from']" (change)="list.apply()" />
        <input type="date" class="form-control form-control-sm" title="Bill date to" [(ngModel)]="list.filters['to']" (change)="list.apply()" />
      </div>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>Bill no.</th><th>Seller</th><th>Plan</th><th>Bill date</th><th>Due</th><th class="text-end">Total</th><th>Status</th></tr></thead>
          <tbody>
            @for (b of list.items(); track b._id) {
              <tr class="row-link" [routerLink]="['/subscription-bills', b._id]">
                <td>@if (b.invoiceNumber) { <code class="ref">{{ b.invoiceNumber }}</code> } @else { <span class="text-muted small">Draft</span> }</td>
                <td>{{ b.sellerId?.shopName || b.billTo?.name }}<div class="cell-sub">{{ b.sellerId?.mobileNumber }}</div></td>
                <td>{{ b.planName }}@if (b.periodFrom) { <div class="cell-sub">{{ b.periodFrom | date: 'd MMM' }} – {{ b.periodTo | date: 'd MMM y' }}</div> }</td>
                <td class="small text-nowrap">{{ b.invoiceDate | date: 'd MMM y' }}</td>
                <td class="small text-nowrap" [class.text-danger]="b.status === 'Issued' && overdue(b)">{{ b.dueDate ? (b.dueDate | date: 'd MMM y') : '—' }}</td>
                <td class="text-end fw-semibold">{{ b.total | inr }}</td>
                <td><app-status-badge [status]="b.status" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No subscription bills yet" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class BillListComponent implements OnInit {
  list = new PagedList<any>('/subscription-bills', { search: '', status: '', sellerId: '', from: '', to: '' });

  sum() {
    return this.list.extra()['summary'] || {};
  }

  overdue(b: any) {
    return b.dueDate && new Date(b.dueDate).getTime() < Date.now();
  }

  ngOnInit() {
    this.list.load();
  }
}
