import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, PaginationComponent, SheetComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-returns',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, SheetComponent],
  template: `
    <app-page-header title="Returns" [subtitle]="(list.extra()['pendingCount'] || 0) + ' waiting for your decision'" />
    <div class="d-flex gap-2 mb-3">
      @for (t of [['', 'All'], ['Initiated', 'Pending'], ['Completed', 'Approved'], ['Rejected', 'Rejected']]; track t[0]) {
        <button class="btn btn-sm rounded-pill" [class.btn-primary]="list.filters['status'] === t[0]" [class.btn-outline-secondary]="list.filters['status'] !== t[0]" (click)="list.filters['status'] = t[0]; list.apply()">{{ t[1] }}</button>
      }
    </div>
    <div class="card">
      <div class="m-list">
        @for (r of list.items(); track r._id) {
          <div class="m-item align-items-start">
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold small">{{ r.userId?.name || r.userId?.mobileNumber }} · <a [routerLink]="['/orders', r.orderId?._id]">{{ r.orderId?.orderId }}</a></span>
              <span class="d-block small">{{ r.reason }}</span>
              @if (r.description) { <span class="cell-sub d-block">{{ r.description }}</span> }
              @if (r.images?.length) { <span class="d-flex gap-1 mt-1">@for (i of r.images; track $index) { <a [href]="i" target="_blank"><img [src]="i" class="thumb" alt="" /></a> }</span> }
              <span class="cell-sub">{{ r.returnId }} · {{ r.createdAt | date: 'd MMM, h:mm a' }}@if (r.approvalNotes) { · {{ r.approvalNotes }} }</span>
            </span>
            <span class="text-end">
              <app-status-badge [status]="r.status === 'Initiated' ? 'Pending' : r.status" />
              <div class="small fw-semibold mt-1">{{ r.refundAmount | inr }}</div>
              @if (r.status === 'Initiated') { <button class="btn btn-sm btn-primary mt-1" (click)="open(r)">Decide</button> }
            </span>
          </div>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="No return requests" icon="bi-arrow-return-left" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
    <app-sheet [open]="!!current()" title="Return request" (closed)="current.set(null)">
      @if (current(); as r) {
        <p class="small mb-2"><strong>{{ r.reason }}</strong><br />{{ r.description }}</p>
        <label class="form-label">Refund amount (₹)</label>
        <input type="number" class="form-control mb-2" [(ngModel)]="amount" min="0" [max]="r.refundAmount" />
        <div class="form-text mb-2">Maximum {{ r.refundAmount | inr }}. Approving marks the order Returned and puts the items back in stock.</div>
        <label class="form-label">Note to customer</label>
        <textarea class="form-control" rows="2" [(ngModel)]="note" placeholder="Required when rejecting"></textarea>
      }
      <div sheet-footer class="sheet-footer">
        <button class="btn btn-outline-danger" (click)="decide(false)" [disabled]="busy()">Reject</button>
        <button class="btn btn-primary" (click)="decide(true)" [disabled]="busy()">Approve & refund</button>
      </div>
    </app-sheet>
  `,
})
export class ReturnsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  list = new PagedList<any>('/returns', { status: 'Initiated' });
  current = signal<any>(null);
  busy = signal(false);
  amount: number | null = null;
  note = '';

  ngOnInit() {
    this.list.load();
  }

  open(r: any) {
    this.current.set(r);
    this.amount = r.refundAmount;
    this.note = '';
  }

  decide(approve: boolean) {
    if (!approve && this.note.trim().length < 3) return this.toast.warning('Write why you are rejecting');
    this.busy.set(true);
    this.api.post<any>(`/returns/${this.current()._id}/decide`, { approve, refundAmount: approve ? Number(this.amount) : undefined, note: this.note }).subscribe({
      next: (r) => { this.busy.set(false); this.current.set(null); this.toast.success(r.message || 'Done'); this.list.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
