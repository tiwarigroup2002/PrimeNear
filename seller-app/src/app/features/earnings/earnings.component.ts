import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { PagedList } from '../../core/utils/paged-list';
import { shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, PageHeaderComponent, PaginationComponent, SheetComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-earnings',
  imports: [DatePipe, ChartComponent, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, SheetComponent],
  template: `
    <app-page-header title="Earnings & payouts" subtitle="Money from app orders is paid to your bank after the holding period" />
    <app-state [loading]="!e()" />
    @if (e(); as e) {
      <div class="card mb-3 border-0 text-white" style="background: linear-gradient(135deg, #059669, #0e7490)"><div class="card-body">
        <div class="small opacity-75">Due for next payout</div>
        <div class="display-6 fw-bold">{{ e.pendingAmount | inr }}</div>
        <div class="small">On hold (return window): {{ e.onHoldAmount | inr }} · In transfer: {{ e.totalPending | inr }}</div>
        @if (settings()) { <div class="small opacity-75 mt-1">{{ settings().payoutFrequency }} payouts · {{ settings().payoutDelayDays }} days after delivery</div> }
      </div></div>
      <div class="row g-2 mb-3 text-center">
        <div class="col-4"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">Total sales</div><div class="fw-semibold">{{ e.totalEarnings | inr: 0 }}</div></div></div></div>
        <div class="col-4"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">Commission</div><div class="fw-semibold">{{ e.totalCommission | inr: 0 }}</div></div></div></div>
        <div class="col-4"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">Paid to you</div><div class="fw-semibold text-success">{{ e.totalPaid | inr: 0 }}</div></div></div></div>
      </div>
      @if (e.pendingDeduction) { <div class="alert alert-warning small">{{ e.pendingDeduction | inr }} will be deducted from your next payout (refunds on already paid orders).</div> }
      @if (settings()?.chargeCommissionOnCash) { <div class="alert alert-info small">Commission on cash / counter sales is deducted from your payouts.</div> }
      @if (e.eachMonthEarnings.length) {
        <div class="card mb-3"><div class="card-header"><span class="card-title">Monthly sales</span></div>
          <div class="card-body"><app-chart type="bar" [labels]="months()" [datasets]="monthSets()" [currency]="true" [height]="220" /></div></div>
      }
    }
    <div class="card">
      <div class="card-header"><span class="card-title">Payouts</span></div>
      <div class="m-list">
        @for (p of list.items(); track p._id) {
          <a class="m-item" role="button" (click)="open(p)">
            <span class="thumb"><i class="bi bi-bank"></i></span>
            <span class="flex-grow-1"><span class="d-block small fw-semibold">{{ p.payoutId }}</span><span class="cell-sub">{{ p.createdAt | date: 'd MMM y' }}@if (p.transactionRef) { · UTR {{ p.transactionRef }} }</span></span>
            <span class="text-end"><span class="d-block fw-semibold">{{ p.amount | inr }}</span><app-status-badge [status]="p.status" /></span>
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="No payouts yet" icon="bi-bank" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-sheet [open]="!!detail()" [title]="'Payout ' + (detail()?.payoutId || '')" (closed)="detail.set(null)">
      @if (detail(); as p) {
        <div class="small">
          <div class="d-flex justify-content-between"><span>App order sales</span><span>{{ p.grossAmount | inr }}</span></div>
          <div class="d-flex justify-content-between"><span>Commission</span><span>-{{ p.commissionAmount | inr }}</span></div>
          @if (p.cashCommissionDeducted) { <div class="d-flex justify-content-between"><span>Commission on cash sales</span><span>-{{ p.cashCommissionDeducted | inr }}</span></div> }
          @if (p.refundDeducted) { <div class="d-flex justify-content-between"><span>Refund recoveries</span><span>-{{ p.refundDeducted | inr }}</span></div> }
          <div class="d-flex justify-content-between fw-bold fs-6 border-top mt-1 pt-1"><span>Paid to you</span><span>{{ p.amount | inr }}</span></div>
          <div class="mt-2"><app-status-badge [status]="p.status" /> {{ p.payoutMethod }} @if (p.transactionRef) { · UTR {{ p.transactionRef }} } @if (p.completedAt) { · {{ p.completedAt | date: 'd MMM y' }} }</div>
          @if (p.failureReason) { <div class="text-danger">Failed: {{ p.failureReason }}</div> }
          <div class="fw-semibold mt-3 mb-1">Orders ({{ p.orderIds?.length }})</div>
          @for (o of p.orderIds; track o._id) { <div class="d-flex justify-content-between border-bottom py-1"><span>{{ o.orderId }}</span><span>{{ o.finalAmount | inr }}</span></div> }
        </div>
      }
    </app-sheet>
  `,
})
export class EarningsComponent implements OnInit {
  private api = inject(ApiService);
  e = signal<any>(null);
  settings = signal<any>(null);
  detail = signal<any>(null);
  list = new PagedList<any>('/payouts', {}, false);
  months = computed(() => (this.e()?.eachMonthEarnings ?? []).map((m: any) => shortDate(m.month)));
  monthSets = computed(() => [
    { label: 'Sales', data: (this.e()?.eachMonthEarnings ?? []).map((m: any) => m.amount) },
    { label: 'Commission', data: (this.e()?.eachMonthEarnings ?? []).map((m: any) => m.commission) },
  ]);

  ngOnInit() {
    this.api.get<any>('/earnings').subscribe((e) => this.e.set(e));
    this.api.get<any>('/settings').subscribe((s) => this.settings.set(s.platform));
    this.list.load();
  }

  open(p: any) {
    this.api.get<any>(`/payouts/${p._id}`).subscribe((d) => this.detail.set(d));
  }
}
