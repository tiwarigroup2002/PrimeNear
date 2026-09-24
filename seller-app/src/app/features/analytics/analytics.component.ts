import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, PageHeaderComponent, SheetComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-analytics',
  imports: [FormsModule, RouterLink, ChartComponent, InrPipe, PageHeaderComponent, StateComponent, SheetComponent],
  template: `
    <app-page-header title="Reports" subtitle="Your sales at a glance">
      <button class="btn btn-sm btn-outline-secondary" (click)="exportOpen.set(true)"><i class="bi bi-download me-1"></i>Export</button>
    </app-page-header>
    <div class="d-flex gap-2 mb-3 overflow-auto pb-1">
      @for (p of periods; track p[0]) {
        <button class="btn btn-sm rounded-pill text-nowrap" [class.btn-primary]="period === p[0]" [class.btn-outline-secondary]="period !== p[0]" (click)="period = p[0]; load()">{{ p[1] }}</button>
      }
    </div>
    <app-state [loading]="!s()" />
    @if (s(); as s) {
      <div class="row g-2 mb-3">
        <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body"><div class="small text-muted">Sales</div><div class="fs-5 fw-bold">{{ s.revenue | inr: 0 }}</div><div class="cell-sub">{{ s.orders }} orders</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body"><div class="small text-muted">Est. profit</div><div class="fs-5 fw-bold" [class.text-success]="s.estimatedProfit > 0">{{ s.estimatedProfit | inr: 0 }}</div><div class="cell-sub">after commission</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body"><div class="small text-muted">Avg. order</div><div class="fs-5 fw-bold">{{ s.averageOrderValue | inr: 0 }}</div><div class="cell-sub">{{ s.customers }} customers</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body"><div class="small text-muted">GST collected</div><div class="fs-5 fw-bold">{{ s.gstCollected | inr: 0 }}</div><div class="cell-sub">commission {{ s.commission | inr: 0 }}</div></div></div></div>
      </div>
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between"><span class="card-title">Daily sales</span>@if (trend()?.bestDay) { <span class="small text-muted">Best day {{ trend().bestDay.date }}: {{ trend().bestDay.sales | inr: 0 }}</span> }</div>
        <div class="card-body"><app-chart type="line" [labels]="labels()" [datasets]="sets()" [currency]="true" [legend]="false" [height]="240" /></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="card h-100"><div class="card-header"><span class="card-title">Cash vs online</span></div>
          <div class="card-body"><app-chart type="doughnut" [labels]="keys(s.paymentMethods)" [datasets]="[{ label: 'Amount', data: vals(s.paymentMethods) }]" [currency]="true" [height]="200" /></div></div></div>
        <div class="col-md-6"><div class="card h-100"><div class="card-header"><span class="card-title">Counter vs app orders</span></div>
          <div class="card-body"><app-chart type="doughnut" [labels]="sourceLabels(s.sources)" [datasets]="[{ label: 'Amount', data: vals(s.sources) }]" [currency]="true" [height]="200" /></div></div></div>
      </div>
      <div class="row g-3">
        <div class="col-md-7"><div class="card h-100"><div class="card-header"><span class="card-title">Best selling products</span></div>
          <div class="m-list">
            @for (p of best(); track p.productId; let i = $index) {
              <a class="m-item" [routerLink]="['/products', p.productId]"><span class="badge rounded-pill text-bg-light border">{{ i + 1 }}</span><span class="flex-grow-1 small fw-semibold text-truncate">{{ p.name }}</span><span class="small text-end"><strong>{{ p.quantity }}</strong> sold<div class="cell-sub">{{ p.revenue | inr: 0 }}</div></span></a>
            } @empty { <div class="text-center text-muted small py-4">No sales in this period</div> }
          </div></div></div>
        <div class="col-md-5"><div class="card h-100"><div class="card-header"><span class="card-title">Customers</span></div>
          @if (c(); as c) {
            <div class="card-body small">
              <div class="d-flex justify-content-between"><span>Total customers</span><strong>{{ c.totalCustomers }}</strong></div>
              <div class="d-flex justify-content-between"><span>New (30 days)</span><strong>{{ c.newThisMonth }}</strong></div>
              <div class="d-flex justify-content-between"><span>Repeat buyers</span><strong>{{ c.repeatCustomers }} / {{ c.buyers }}</strong></div>
              <div class="fw-semibold mt-3 mb-1">Top customers</div>
              @for (t of c.topCustomers; track t._id) { <div class="d-flex justify-content-between"><span>{{ t.name || t.mobileNumber }}</span><span>{{ t.totalSpent | inr: 0 }}</span></div> }
            </div>
          }
        </div></div>
      </div>
    }

    <app-sheet [open]="exportOpen()" title="Export report" (closed)="exportOpen.set(false)">
      <label class="form-label">Report</label>
      <select class="form-select mb-3" [(ngModel)]="exp.type"><option value="Orders">Orders / bills</option><option value="Revenue">Daily sales</option><option value="Products">Products & stock</option></select>
      <label class="form-label">Period</label>
      <select class="form-select mb-3" [(ngModel)]="exp.period">@for (p of periods; track p[0]) { <option [value]="p[0]">{{ p[1] }}</option> }</select>
      <label class="form-label">Format</label>
      <div class="btn-group w-100">
        @for (f of ['PDF', 'Excel', 'CSV']; track f) { <input type="radio" class="btn-check" [id]="'x' + f" name="xf" [value]="f" [(ngModel)]="exp.format" /><label class="btn btn-outline-primary" [for]="'x' + f">{{ f }}</label> }
      </div>
      <div sheet-footer class="sheet-footer"><button class="btn btn-primary w-100" (click)="download()" [disabled]="busy()">@if (busy()) { <span class="spinner-border spinner-border-sm me-1"></span> }Download</button></div>
    </app-sheet>
  `,
})
export class AnalyticsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  periods = [['today', 'Today'], ['week', '7 days'], ['month', '30 days'], ['quarter', '90 days'], ['year', '1 year']];
  period = 'month';
  s = signal<any>(null);
  trend = signal<any>(null);
  best = signal<any[]>([]);
  c = signal<any>(null);
  exportOpen = signal(false);
  busy = signal(false);
  exp = { type: 'Orders', period: 'month', format: 'PDF' };

  labels = computed(() => (this.trend()?.dates ?? []).map((d: string) => shortDate(d)));
  sets = computed(() => [{ label: 'Sales', data: this.trend()?.sales ?? [] }]);

  ngOnInit() {
    this.load();
    this.api.get<any>('/analytics/customer-analysis').subscribe((c) => this.c.set(c));
  }

  load() {
    const days = { today: 1, week: 7, month: 30, quarter: 90, year: 365 }[this.period] || 30;
    this.api.get<any>('/analytics/summary', { period: this.period }).subscribe((s) => this.s.set(s));
    this.api.get<any>('/analytics/sales-trend', { days }).subscribe((t) => this.trend.set(t));
    this.api.get<any>('/analytics/best-selling', { period: this.period, limit: 10 }).subscribe((b) => this.best.set(b.products));
  }

  keys(o: Record<string, any>) { return Object.keys(o || {}); }
  vals(o: Record<string, any>) { return Object.values(o || {}).map((v: any) => v.amount); }
  sourceLabels(o: Record<string, any>) { return this.keys(o).map((k) => (k === 'POS' ? 'Counter' : 'App')); }

  download() {
    this.busy.set(true);
    this.http.post(`${this.api.base}/analytics/export-report`, this.exp, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (res) => {
        this.busy.set(false);
        const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'report';
        const url = URL.createObjectURL(res.body as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exportOpen.set(false);
      },
      error: () => { this.busy.set(false); this.toast.error('Could not create the report'); },
    });
  }
}
