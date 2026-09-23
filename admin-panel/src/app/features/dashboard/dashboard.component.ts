import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { downloadCsv, isoDate, shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, PageHeaderComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeaderComponent, StatCardComponent, ChartComponent, StatusBadgeComponent, StateComponent, InrPipe, DatePipe, DecimalPipe, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);
  router = inject(Router);

  data = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  range = signal<'7' | '30' | '90' | 'custom'>('30');
  from = isoDate(new Date(Date.now() - 29 * 86400000));
  to = isoDate(new Date());
  lastUpdated = signal<Date | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  labels = computed(() => (this.data()?.charts.revenueData ?? []).map((p: any) => shortDate(p.date)));
  revenueSets = computed(() => [{ label: 'Revenue', data: (this.data()?.charts.revenueData ?? []).map((p: any) => p.value) }]);
  orderSets = computed(() => [{ label: 'Orders', data: (this.data()?.charts.orderData ?? []).map((p: any) => p.value) }]);
  growthSets = computed(() => [
    { label: 'Users', data: (this.data()?.charts.userGrowth ?? []).map((p: any) => p.total) },
    { label: 'Sellers', data: (this.data()?.charts.sellerGrowth ?? []).map((p: any) => p.total), yAxisID: 'y' },
  ]);

  ngOnInit() {
    this.load();
    // Auto refresh every 5 minutes
    this.timer = setInterval(() => this.load(true), 5 * 60000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  setRange(r: '7' | '30' | '90' | 'custom') {
    this.range.set(r);
    if (r !== 'custom') {
      this.from = isoDate(new Date(Date.now() - (+r - 1) * 86400000));
      this.to = isoDate(new Date());
      this.load();
    }
  }

  load(silent = false) {
    if (!silent) this.loading.set(true);
    this.api.get<any>('/analytics/dashboard', { from: this.from, to: this.to }).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.error.set(null);
        this.lastUpdated.set(new Date());
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  alertIcon(level: string) {
    return { critical: 'bi-exclamation-octagon-fill text-danger', warning: 'bi-exclamation-triangle-fill text-warning', info: 'bi-info-circle-fill text-info' }[level] ?? 'bi-info-circle';
  }

  export() {
    const d = this.data();
    if (!d) return;
    const rows = d.charts.revenueData.map((p: any, i: number) => [p.date, d.charts.orderData[i]?.value, p.value, d.charts.userGrowth[i]?.value, d.charts.sellerGrowth[i]?.value]);
    downloadCsv(`dashboard-${this.from}-to-${this.to}.csv`, ['Date', 'Orders', 'Revenue', 'New users', 'New sellers'], rows);
  }
}
