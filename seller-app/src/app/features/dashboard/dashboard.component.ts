import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { shortDate } from '../../core/utils/csv';
import { ChartComponent, InrPipe, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, ChartComponent, InrPipe, StateComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  d = signal<any>(null);
  trend = signal<any>(null);
  error = signal<string | null>(null);
  greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  labels = computed(() => (this.trend()?.dates ?? []).map((x: string) => shortDate(x)));
  sets = computed(() => [{ label: 'Sales', data: this.trend()?.sales ?? [] }]);

  ngOnInit() {
    this.api.get<any>('/dashboard').subscribe({ next: (d) => this.d.set(d), error: (e) => this.error.set(errorMessage(e)) });
    this.api.get<any>('/analytics/sales-trend', { days: 14 }).subscribe({ next: (t) => this.trend.set(t), error: () => {} });
  }
}
