import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { isoDate } from '../../core/utils/csv';
import { EntitySelectComponent, PageHeaderComponent, PaginationComponent, StateComponent } from '../../shared';

const TYPES = ['Revenue', 'Orders', 'Users', 'Sellers', 'Products', 'Disputes', 'Payouts'];

@Component({
  selector: 'app-reports',
  imports: [DatePipe, FormsModule, PageHeaderComponent, PaginationComponent, StateComponent, EntitySelectComponent],
  template: `
    <app-page-header title="Reports" icon="bi-file-earmark-bar-graph" subtitle="Generate PDF / Excel / CSV reports or schedule them by email" />
    <div class="row g-3">
      <div class="col-xl-4">
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">Generate report</span></div>
          <div class="card-body">
            <label class="form-label">Report type</label>
            <select class="form-select mb-3" [(ngModel)]="form.reportType">@for (t of types; track t) { <option>{{ t }}</option> }</select>
            <label class="form-label">Period</label>
            <select class="form-select mb-3" [(ngModel)]="form.period">
              <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option><option value="quarter">Last 90 days</option><option value="year">Last 12 months</option><option value="all">All time</option><option value="custom">Custom</option>
            </select>
            @if (form.period === 'custom') {
              <div class="row g-2 mb-3"><div class="col"><input type="date" class="form-control" [(ngModel)]="form.from" /></div><div class="col"><input type="date" class="form-control" [(ngModel)]="form.to" /></div></div>
            }
            @if (['Orders', 'Revenue', 'Products'].includes(form.reportType)) {
              <label class="form-label">Seller (optional)</label>
              <div class="mb-3"><app-entity-select kind="seller" placeholder="All sellers" (selected)="form.sellerId = $event?._id || ''" /></div>
            }
            @if (form.reportType === 'Orders') {
              <label class="form-label">Order status (optional)</label>
              <select class="form-select mb-3" [(ngModel)]="form.status"><option value="">All</option>@for (s of ['Pending','Confirmed','Packed','Shipped','Delivered','Cancelled','Returned']; track s) { <option>{{ s }}</option> }</select>
            }
            <label class="form-label">Format</label>
            <div class="btn-group w-100 mb-3">
              @for (f of ['PDF', 'Excel', 'CSV']; track f) {
                <input type="radio" class="btn-check" name="fmt" [id]="'f' + f" [value]="f" [(ngModel)]="form.format" />
                <label class="btn btn-outline-primary" [for]="'f' + f"><i class="bi" [class.bi-filetype-pdf]="f === 'PDF'" [class.bi-file-earmark-excel]="f === 'Excel'" [class.bi-filetype-csv]="f === 'CSV'"></i> {{ f }}</label>
              }
            </div>
            <button class="btn btn-primary w-100" (click)="generate()" [disabled]="busy()">@if (busy()) { <span class="spinner-border spinner-border-sm me-1"></span>Generating... } @else { <i class="bi bi-gear me-1"></i>Generate & download }</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Schedule by email</span></div>
          <div class="card-body">
            <div class="row g-2 mb-2">
              <div class="col-6"><select class="form-select form-select-sm" [(ngModel)]="sched.reportType">@for (t of types; track t) { <option>{{ t }}</option> }</select></div>
              <div class="col-6"><select class="form-select form-select-sm" [(ngModel)]="sched.frequency"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></div>
            </div>
            <select class="form-select form-select-sm mb-2" [(ngModel)]="sched.format"><option>Excel</option><option>PDF</option><option>CSV</option></select>
            <input class="form-control form-control-sm mb-2" [(ngModel)]="sched.recipients" placeholder="Emails, comma separated" />
            <button class="btn btn-sm btn-outline-primary w-100" (click)="schedule()"><i class="bi bi-calendar-plus me-1"></i>Add schedule</button>
            <div class="form-text">Sent at 7:00 AM (daily / Monday / 1st of month). Requires SMTP to be configured on the server.</div>
          </div>
          <ul class="list-group list-group-flush">
            @for (s of schedules(); track s._id) {
              <li class="list-group-item small d-flex gap-2 align-items-center">
                <div class="flex-grow-1">
                  <strong>{{ s.frequency }} {{ s.reportType }}</strong> ({{ s.format }})
                  <div class="text-muted text-truncate">{{ s.recipients.join(', ') }}</div>
                  <div class="text-muted">Next: {{ s.nextRunAt | date: 'd MMM, h:mm a' }}@if (s.lastRunAt) { · last {{ s.lastRunAt | date: 'd MMM' }} }</div>
                </div>
                <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" [checked]="s.isActive" (change)="toggleSchedule(s)" /></div>
                <button class="btn btn-sm btn-light text-danger" (click)="removeSchedule(s)"><i class="bi bi-trash"></i></button>
              </li>
            }
          </ul>
        </div>
      </div>
      <div class="col-xl-8">
        <div class="card">
          <div class="card-header d-flex justify-content-between"><span class="card-title">Generated reports</span>
            <select class="form-select form-select-sm w-auto" [(ngModel)]="list.filters['reportType']" (change)="list.apply()"><option value="">All types</option>@for (t of types; track t) { <option>{{ t }}</option> }</select></div>
          <div class="table-responsive">
            <table class="table table-hover">
              <thead><tr><th>Report</th><th>Period</th><th>Format</th><th class="text-end">Rows</th><th class="text-end">Size</th><th>Generated</th><th class="text-end">Actions</th></tr></thead>
              <tbody>
                @for (r of list.items(); track r._id) {
                  <tr>
                    <td class="fw-semibold">{{ r.reportType }}@if (r.scheduleId) { <span class="badge text-bg-light border ms-1">scheduled</span> }</td>
                    <td class="small">{{ r.from | date: 'd MMM y' }} – {{ r.to | date: 'd MMM y' }}</td>
                    <td><span class="badge" [class.text-bg-danger]="r.format === 'PDF'" [class.text-bg-success]="r.format === 'Excel'" [class.text-bg-secondary]="r.format === 'CSV'">{{ r.format }}</span></td>
                    <td class="text-end">{{ r.rowCount }}</td>
                    <td class="text-end small">{{ (r.fileSize / 1024).toFixed(1) }} KB</td>
                    <td class="small">{{ r.createdAt | date: 'd MMM y, h:mm a' }}<div class="cell-sub">{{ r.generatedBy?.fullName }}</div></td>
                    <td class="text-end text-nowrap">
                      <button class="btn btn-sm btn-light" title="Download" (click)="download(r)"><i class="bi bi-download"></i></button>
                      <button class="btn btn-sm btn-light" title="Email to me" (click)="email(r)"><i class="bi bi-envelope"></i></button>
                      <button class="btn btn-sm btn-light text-danger" title="Delete" (click)="remove(r)"><i class="bi bi-trash"></i></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No reports generated yet" icon="bi-file-earmark" />
          <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
        </div>
      </div>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);
  types = TYPES;
  list = new PagedList<any>('/reports', { reportType: '' }, false);
  schedules = signal<any[]>([]);
  busy = signal(false);
  form: any = { reportType: 'Revenue', period: 'month', format: 'Excel', from: isoDate(new Date(Date.now() - 29 * 86400000)), to: isoDate(new Date()), sellerId: '', status: '' };
  sched: any = { reportType: 'Revenue', frequency: 'Weekly', format: 'Excel', recipients: this.auth.admin()?.email || '' };

  ngOnInit() {
    this.list.load();
    this.loadSchedules();
  }

  loadSchedules() {
    this.api.get<any>('/reports/scheduled').subscribe((r) => this.schedules.set(r.reports));
  }

  generate() {
    const f = this.form;
    const filters: any = {};
    if (f.sellerId) filters.sellerId = f.sellerId;
    if (f.status && f.reportType === 'Orders') filters.status = f.status;
    const body: any = { reportType: f.reportType, format: f.format, period: f.period, filters };
    if (f.period === 'custom') Object.assign(body, { from: f.from, to: f.to });
    this.busy.set(true);
    this.api.post<any>('/reports/generate', body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(`${r.data.report.reportType} report ready (${r.data.report.rowCount} rows)`);
        this.download(r.data.report);
        this.list.apply();
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  download(r: any) {
    this.api.download(`/reports/${r._id}/download`, r.fileName).subscribe({ error: () => this.toast.error('Download failed') });
  }

  email(r: any) {
    this.api.post<any>(`/reports/${r._id}/email`, {}).subscribe({ next: (res) => this.toast.success(res.message || 'Sent'), error: (e) => this.toast.error(errorMessage(e)) });
  }

  async remove(r: any) {
    if (!(await this.confirm.confirm('Delete report?', 'The file will be removed.'))) return;
    this.api.delete(`/reports/${r._id}`).subscribe({ next: () => this.list.load(), error: (e) => this.toast.error(errorMessage(e)) });
  }

  schedule() {
    const recipients = String(this.sched.recipients).split(/[,;\s]+/).map((s: string) => s.trim()).filter(Boolean);
    if (!recipients.length) return this.toast.warning('Enter at least one email');
    this.api.post('/reports/schedule', { ...this.sched, recipients }).subscribe({
      next: () => { this.toast.success('Report scheduled'); this.loadSchedules(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  toggleSchedule(s: any) {
    this.api.put(`/reports/schedule/${s._id}`, { isActive: !s.isActive }).subscribe({ next: () => this.loadSchedules(), error: (e) => this.toast.error(errorMessage(e)) });
  }

  async removeSchedule(s: any) {
    if (!(await this.confirm.confirm('Delete schedule?', `${s.frequency} ${s.reportType} report will stop.`))) return;
    this.api.delete(`/reports/schedule/${s._id}`).subscribe({ next: () => this.loadSchedules(), error: (e) => this.toast.error(errorMessage(e)) });
  }
}
