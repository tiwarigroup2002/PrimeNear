import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { downloadCsv, isoDate, shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, PageHeaderComponent, StatCardComponent, StateComponent } from '../../shared';

type Tab = 'revenue' | 'orders' | 'users' | 'sellers' | 'products' | 'payments';

@Component({
  selector: 'app-analytics',
  imports: [FormsModule, DecimalPipe, RouterLink, PageHeaderComponent, StatCardComponent, StateComponent, ChartComponent, InrPipe],
  templateUrl: './analytics.component.html',
})
export class AnalyticsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  tabs: [Tab, string, string][] = [
    ['revenue', 'Revenue', 'bi-currency-rupee'],
    ['orders', 'Orders', 'bi-bag'],
    ['users', 'Users', 'bi-people'],
    ['sellers', 'Sellers', 'bi-shop'],
    ['products', 'Products', 'bi-box'],
    ['payments', 'Payments', 'bi-credit-card'],
  ];
  tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'revenue');
  period = 'month';
  from = isoDate(new Date(Date.now() - 29 * 86400000));
  to = isoDate(new Date());
  data = signal<any>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  series = computed(() => this.data()?.series ?? this.data()?.orderTrend ?? this.data()?.userGrowthTrend ?? this.data()?.sellerGrowthTrend ?? []);
  labels = computed(() => this.series().map((s: any) => shortDate(s.date)));

  ngOnInit() {
    this.load();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.data.set(null);
    const q: any = { period: this.period };
    if (this.period === 'custom') Object.assign(q, { from: this.from, to: this.to });
    this.api.get<any>(`/analytics/${this.tab()}`, q).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); this.error.set(null); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  // Chart helpers
  ds(label: string, key: string, extra: any = {}) {
    return { label, data: this.series().map((s: any) => s[key]), ...extra };
  }
  entries(obj: Record<string, any> | undefined) {
    return Object.entries(obj ?? {});
  }
  pie(obj: Record<string, any> | undefined, key?: string) {
    return [{ label: 'Value', data: this.entries(obj).map(([, v]) => (key ? v[key] : v)) }];
  }
  pieFromList(list: any[] | undefined, key: string) {
    return [{ label: 'Value', data: (list ?? []).map((x) => x[key]) }];
  }
  names(list: any[] | undefined, key: string) {
    return (list ?? []).map((x) => x[key] ?? '—');
  }

  export() {
    const s = this.series();
    if (!s.length) return;
    const keys = Object.keys(s[0]);
    downloadCsv(`${this.tab()}-analytics.csv`, keys, s.map((r: any) => keys.map((k) => r[k])));
  }
}
