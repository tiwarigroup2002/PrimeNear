import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { Seller, Tahsil } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { downloadCsv } from '../../core/utils/csv';
import { CanDirective, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-seller-list',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, CanDirective],
  templateUrl: './seller-list.component.html',
})
export class SellerListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  list = new PagedList<Seller>('/sellers', { search: '', status: '', tahsilId: '', districtId: '', sortBy: 'recent' });
  tahsils = signal<Tahsil[]>([]);
  selected = signal<Set<string>>(new Set());
  busy = signal(false);

  constructor(lookup: LookupService) {
    lookup.tahsils().subscribe((t) => this.tahsils.set(t));
  }

  ngOnInit() {
    this.list.load();
  }

  toggle(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  toggleAll(checked: boolean) {
    this.selected.set(new Set(checked ? this.list.items().map((s) => s._id) : []));
  }

  async block(s: Seller) {
    const reason = await this.confirm.prompt(`Block ${s.shopName}?`, 'The seller will be logged out and customers cannot order from this shop until unblocked.', 'Reason', 'Block seller');
    if (reason === null) return;
    this.api.post(`/sellers/${s._id}/block`, { reason }).subscribe({
      next: () => { this.toast.success(`${s.shopName} blocked`); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async unblock(s: Seller) {
    if (!(await this.confirm.confirm(`Unblock ${s.shopName}?`, 'The shop will become active again.', 'success', 'Unblock'))) return;
    this.api.post(`/sellers/${s._id}/unblock`).subscribe({
      next: () => { this.toast.success(`${s.shopName} unblocked`); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async remove(s: Seller) {
    const r = await this.confirm.open({ title: `Delete ${s.shopName}?`, message: 'The shop and its products will be hidden. Order history is kept. This cannot be undone from the panel.', variant: 'danger', confirmText: 'Delete', input: { label: 'Reason (optional)' } });
    if (!r.confirmed) return;
    this.api.delete(`/sellers/${s._id}`, { reason: r.value }).subscribe({
      next: () => { this.toast.success('Seller deleted'); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async bulkBlock() {
    const ids = [...this.selected()];
    const reason = await this.confirm.prompt(`Block ${ids.length} seller(s)?`, 'All selected sellers will be blocked.', 'Reason', 'Block all');
    if (reason === null) return;
    this.busy.set(true);
    let ok = 0;
    for (const id of ids) {
      await new Promise<void>((res) => this.api.post(`/sellers/${id}/block`, { reason }).subscribe({ next: () => { ok++; res(); }, error: () => res() }));
    }
    this.busy.set(false);
    this.selected.set(new Set());
    this.toast.success(`${ok} of ${ids.length} seller(s) blocked`);
    this.list.load();
  }

  export() {
    downloadCsv('sellers.csv', ['Shop', 'Owner', 'Mobile', 'Tahsil', 'Status', 'Orders', 'Revenue', 'Customers', 'Rating', 'Joined'],
      this.list.items().map((s) => [s.shopName, s.ownerName, s.mobileNumber, s.tahsilId?.name, s.status, s.orders, s.revenue, s.customers, s.rating, s.createdAt?.slice(0, 10)]));
  }
}
