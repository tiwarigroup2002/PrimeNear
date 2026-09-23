import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, PageHeaderComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-payment-dashboard',
  imports: [DatePipe, RouterLink, PageHeaderComponent, StatCardComponent, StateComponent, ChartComponent, StatusBadgeComponent, InrPipe],
  template: `
    <app-page-header title="Payments" icon="bi-wallet2" subtitle="Money collected, commission earned and seller payouts">
      <a routerLink="/payments/transactions" class="btn btn-sm btn-outline-secondary"><i class="bi bi-receipt me-1"></i>Transactions</a>
      <a routerLink="/payments/payouts" class="btn btn-sm btn-primary"><i class="bi bi-bank me-1"></i>Manage payouts</a>
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (d(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-sm-6 col-xl-3"><app-stat-card label="Total revenue" [value]="d.totalRevenue | inr: 0" icon="bi-currency-rupee" color="primary" [hint]="(d.thisMonthRevenue | inr: 0) + ' this month'" /></div>
        <div class="col-sm-6 col-xl-3"><app-stat-card label="Commission earned" [value]="d.totalCommission | inr: 0" icon="bi-percent" color="success" hint="Platform income" /></div>
        <div class="col-sm-6 col-xl-3"><app-stat-card label="Paid to sellers" [value]="d.totalPayoutsGiven | inr: 0" icon="bi-bank" color="info" /></div>
        <div class="col-sm-6 col-xl-3"><app-stat-card label="Pending payouts" [value]="d.pendingPayouts | inr: 0" icon="bi-hourglass-split" color="warning" [hint]="d.sellersDue + ' seller(s) due · ' + d.payoutsInProgressCount + ' in progress'" link="/payments/payouts" /></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-header"><span class="card-title">Payout schedule</span></div>
            <div class="card-body">
              <dl class="dl-grid">
                <dt>Frequency</dt><dd>{{ d.payoutFrequency }}</dd>
                <dt>Next payout</dt><dd>{{ d.nextPayoutDate | date: 'EEE, d MMM y' }}</dd>
                <dt>Holding period</dt><dd>{{ d.payoutDelayDays }} days after delivery</dd>
                <dt>Due now</dt><dd class="fw-semibold">{{ d.dueForPayout | inr }}</dd>
                <dt>In progress</dt><dd>{{ d.payoutsInProgress | inr }}</dd>
                <dt>On hold</dt><dd>{{ d.onHoldAmount | inr }}</dd>
                <dt>Failed payments</dt><dd [class.text-danger]="d.failedPaymentsThisMonth">{{ d.failedPaymentsThisMonth }} this month</dd>
              </dl>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-header"><span class="card-title">Payment methods</span></div>
            <div class="card-body"><app-chart type="doughnut" [labels]="methodLabels()" [datasets]="methodSets()" [currency]="true" [height]="220" /></div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-header"><span class="card-title">Money flow</span></div>
            <div class="card-body"><app-chart type="bar" [labels]="['Collected', 'Commission', 'Paid out', 'Pending']" [datasets]="flowSets()" [currency]="true" [legend]="false" [height]="220" /></div>
          </div>
        </div>
      </div>
      @if (auth.can('analytics.view', 'payments.view')) {
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">Payments vs refunds (last 30 days)</span></div>
          <div class="card-body"><app-chart type="bar" [labels]="trendLabels()" [datasets]="trendSets()" [currency]="true" [height]="240" /></div>
        </div>
      }
      <div class="card">
        <div class="card-header d-flex justify-content-between"><span class="card-title">Recent transactions</span><a routerLink="/payments/transactions" class="small">View all</a></div>
        <div class="table-responsive">
          <table class="table table-hover">
            <thead><tr><th>Transaction</th><th>Order</th><th>Seller</th><th>Type</th><th class="text-end">Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              @for (t of d.recentTransactions; track t._id) {
                <tr>
                  <td><code class="ref">{{ t.transactionId }}</code></td>
                  <td>@if (t.orderId) { <a [routerLink]="['/orders', t.orderId._id]">{{ t.orderId.orderId }}</a> } @else { — }</td>
                  <td>{{ t.sellerId?.shopName }}</td><td>{{ t.type }} · {{ t.method }}</td>
                  <td class="text-end" [class.text-danger]="t.type === 'Refund'">{{ t.amount | inr }}</td>
                  <td><app-status-badge [status]="t.status" /></td><td class="small">{{ t.createdAt | date: 'd MMM, h:mm a' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class PaymentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  d = signal<any>(null);
  trend = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  methodLabels = computed(() => Object.keys(this.d()?.paymentMethodBreakdown ?? {}));
  methodSets = computed(() => [{ label: 'Amount', data: Object.values(this.d()?.paymentMethodBreakdown ?? {}).map((m: any) => m.amount) }]);
  flowSets = computed(() => {
    const d = this.d();
    return d ? [{ label: 'Amount', data: [d.totalRevenue, d.totalCommission, d.totalPayoutsGiven, d.pendingPayouts], backgroundColor: ['#2563eb', '#16a34a', '#0891b2', '#f59e0b'] }] : [];
  });
  trendLabels = computed(() => (this.trend()?.series ?? []).map((s: any) => shortDate(s.date)));
  trendSets = computed(() => [
    { label: 'Payments', data: (this.trend()?.series ?? []).map((s: any) => s.payments) },
    { label: 'Refunds', data: (this.trend()?.series ?? []).map((s: any) => s.refunds), backgroundColor: '#dc2626cc', borderColor: '#dc2626' },
  ]);

  ngOnInit() {
    this.api.get<any>('/payments/dashboard').subscribe({
      next: (d) => { this.d.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
    this.api.get<any>('/analytics/payments', { period: 'month' }).subscribe({ next: (t) => this.trend.set(t), error: () => {} });
  }
}
