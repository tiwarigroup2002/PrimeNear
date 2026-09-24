import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PagedList } from '../../core/utils/paged-list';
import { PageHeaderComponent, PaginationComponent, StateComponent, TimeAgoPipe } from '../../shared';

@Component({
  selector: 'app-notifications',
  imports: [PageHeaderComponent, PaginationComponent, StateComponent, TimeAgoPipe],
  template: `
    <app-page-header title="Notifications">
      @if (list.extra()['unreadCount']) { <button class="btn btn-sm btn-outline-secondary" (click)="readAll()"><i class="bi bi-check2-all me-1"></i>Mark all read</button> }
    </app-page-header>
    <div class="card">
      <div class="m-list">
        @for (n of list.items(); track n._id) {
          <a class="m-item" role="button" (click)="open(n)" [class.bg-success-subtle]="!n.isRead">
            <span class="thumb"><i class="bi {{ icon(n.type) }}"></i></span>
            <span class="flex-grow-1 min-w-0"><span class="d-block small fw-semibold">{{ n.title }}</span>@if (n.message) { <span class="small d-block text-muted">{{ n.message }}</span> }<span class="cell-sub">{{ n.createdAt | timeAgo }}</span></span>
            @if (!n.isRead) { <span class="badge rounded-pill bg-primary">&nbsp;</span> }
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="You're all caught up" icon="bi-bell" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class NotificationsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  list = new PagedList<any>('/notifications', {}, false);

  ngOnInit() {
    this.list.load();
  }

  icon(type: string) {
    return { LowStock: 'bi-exclamation-triangle text-warning', OrderStatus: 'bi-bag', Payout: 'bi-bank text-success', Refund: 'bi-arrow-counterclockwise', Dispute: 'bi-life-preserver', Product: 'bi-box', Account: 'bi-shield-exclamation text-danger' }[type] ?? 'bi-bell';
  }

  open(n: any) {
    if (!n.isRead) this.api.put(`/notifications/${n._id}/read`).subscribe(() => this.list.load());
    const link = n.link || (n.data?.orderId ? `/orders/${n.data.orderId}` : n.data?.payoutId ? '/earnings' : n.data?.disputeId ? `/support/${n.data.disputeId}` : null);
    if (link) this.router.navigateByUrl(link);
  }

  readAll() {
    this.api.post('/notifications/mark-all-read').subscribe(() => this.list.load());
  }
}
