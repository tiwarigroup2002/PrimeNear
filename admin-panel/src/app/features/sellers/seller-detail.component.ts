import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Paged } from '../../core/models/api.models';
import { shortDate } from '../../core/utils/csv';
import { CanDirective, ChartComponent, InrPipe, ModalComponent, PageHeaderComponent, PaginationComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

type Tab = 'overview' | 'products' | 'orders' | 'customers' | 'payments' | 'performance';

@Component({
  selector: 'app-seller-detail',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, StatCardComponent, StatusBadgeComponent, StateComponent, PaginationComponent, InrPipe, ChartComponent, ModalComponent, CanDirective],
  templateUrl: './seller-detail.component.html',
})
export class SellerDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  auth = inject(AuthService);

  data = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  tab = signal<Tab>('overview');

  // Sub tables
  rows = signal<any[]>([]);
  extra = signal<any>({});
  page = 1;
  pages = signal(1);
  total = signal(0);
  tabLoading = signal(false);
  search = '';
  status = '';

  commissionModal = signal(false);
  commissionValue: number | null = null;
  commissionDefault = true;

  monthLabels = computed(() => (this.data()?.earnings.eachMonthEarnings ?? []).map((m: any) => shortDate(m.month)));
  monthSets = computed(() => {
    const m = this.data()?.earnings.eachMonthEarnings ?? [];
    return [
      { label: 'Sales', data: m.map((x: any) => x.amount) },
      { label: 'Commission', data: m.map((x: any) => x.commission) },
    ];
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.get<any>(`/sellers/${this.id}`).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  setTab(t: Tab) {
    this.tab.set(t);
    this.page = 1;
    this.search = '';
    this.status = '';
    if (!['overview', 'performance'].includes(t)) this.loadTab();
  }

  loadTab() {
    const t = this.tab();
    this.tabLoading.set(true);
    this.api.get<Paged<any>>(`/sellers/${this.id}/${t}`, { page: this.page, limit: 10, search: this.search, status: this.status }).subscribe({
      next: (r) => {
        const { items, totalCount, pages, ...rest } = r;
        this.rows.set(items);
        this.total.set(totalCount);
        this.pages.set(pages);
        this.extra.set(rest);
        this.tabLoading.set(false);
      },
      error: (e) => {
        this.toast.error(errorMessage(e));
        this.tabLoading.set(false);
      },
    });
  }

  goTo(p: number) {
    this.page = p;
    this.loadTab();
  }

  async block() {
    const s = this.data().seller;
    const reason = await this.confirm.prompt(`Block ${s.shopName}?`, 'The seller will be logged out and the shop hidden from customers.', 'Reason', 'Block seller');
    if (reason === null) return;
    this.api.post(`/sellers/${this.id}/block`, { reason }).subscribe({ next: () => { this.toast.success('Seller blocked'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  async unblock() {
    if (!(await this.confirm.confirm('Unblock seller?', 'The shop will become active again.', 'success', 'Unblock'))) return;
    this.api.post(`/sellers/${this.id}/unblock`).subscribe({ next: () => { this.toast.success('Seller unblocked'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  async remove() {
    const r = await this.confirm.open({ title: 'Delete seller?', message: 'The shop and its products will be hidden. Order history is kept.', variant: 'danger', confirmText: 'Delete', input: { label: 'Reason (optional)' } });
    if (!r.confirmed) return;
    this.api.delete(`/sellers/${this.id}`, { reason: r.value }).subscribe({
      next: () => { this.toast.success('Seller deleted'); this.router.navigate(['/sellers']); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  openCommission() {
    const s = this.data().seller;
    this.commissionDefault = s.commissionRate === null || s.commissionRate === undefined;
    this.commissionValue = s.commissionRate ?? s.effectiveCommissionRate;
    this.commissionModal.set(true);
  }

  saveCommission() {
    const rate = this.commissionDefault ? null : Number(this.commissionValue);
    if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      this.toast.warning('Commission must be between 0 and 100');
      return;
    }
    this.api.put<any>(`/sellers/${this.id}/commission`, { commissionRate: rate }).subscribe({
      next: (r) => {
        this.toast.success(`Commission set to ${r.data.newRate}%`);
        this.commissionModal.set(false);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
