import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { isoDate } from '../../core/utils/csv';
import { CanDirective, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-payouts',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, CanDirective],
  templateUrl: './payouts.component.html',
})
export class PayoutsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  auth = inject(AuthService);

  tab = signal<'due' | 'history'>(inject(ActivatedRoute).snapshot.queryParamMap.get('status') ? 'history' : 'due');
  due = signal<any>(null);
  dueLoading = signal(false);
  selected = signal<Set<string>>(new Set());
  payoutDate = isoDate(new Date());
  notes = '';
  busy = signal(false);
  lastResult = signal<any>(null);

  list = new PagedList<any>('/payouts', { status: '', search: '', from: '', to: '' });

  selectedTotal = computed(() => (this.due()?.sellers ?? []).filter((s: any) => this.selected().has(s.sellerId)).reduce((sum: number, s: any) => sum + Math.max(s.netAmount, 0), 0));

  ngOnInit() {
    this.loadDue();
    this.list.load();
  }

  loadDue() {
    this.dueLoading.set(true);
    this.api.get<any>('/payouts/pending').subscribe({
      next: (d) => {
        this.due.set(d);
        this.selected.set(new Set(d.sellers.filter((s: any) => s.netAmount > 0 && s.seller?.hasBankDetails).map((s: any) => s.sellerId)));
        this.dueLoading.set(false);
      },
      error: (e) => { this.toast.error(errorMessage(e)); this.dueLoading.set(false); },
    });
  }

  toggle(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  toggleAll(on: boolean) {
    this.selected.set(new Set(on ? (this.due()?.sellers ?? []).filter((s: any) => s.netAmount > 0).map((s: any) => s.sellerId) : []));
  }

  async initiate() {
    const ids = [...this.selected()];
    if (!ids.length) return this.toast.warning('Select at least one seller');
    const ok = await this.confirm.confirm('Initiate payouts?', `Create payouts for ${ids.length} seller(s), total ₹${this.selectedTotal().toLocaleString('en-IN')}.\nAfter transferring the money from your bank, mark each payout Completed with the UTR number.`, 'primary', 'Initiate payouts');
    if (!ok) return;
    this.busy.set(true);
    this.api.post<any>('/payouts/initiate', { sellerIds: ids, payoutDate: this.payoutDate, notes: this.notes }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.lastResult.set(r.data);
        this.toast.success(`${r.data.sellerCount} payout(s) created`);
        this.loadDue();
        this.list.load();
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
