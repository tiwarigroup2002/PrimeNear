import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { CanDirective, InrPipe, ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent, TimeAgoPipe } from '../../shared';
import { DISPUTE_CATEGORIES, PRIORITIES } from './dispute-list.component';

@Component({
  selector: 'app-dispute-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, TimeAgoPipe, CanDirective],
  templateUrl: './dispute-detail.component.html',
})
export class DisputeDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  auth = inject(AuthService);

  d = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  admins = signal<any[]>([]);
  priorities = PRIORITIES;
  categories = DISPUTE_CATEGORIES;

  comment = '';
  files: File[] = [];
  posting = signal(false);

  resolveOpen = signal(false);
  resolution = { resolution: '', refundAmount: 0, refundTo: 'None', notes: '' };
  busy = signal(false);

  ngOnInit() {
    this.load();
    if (this.auth.can('admins.manage')) {
      this.api.get<any>('/admins', { limit: 100, status: 'active' }).subscribe({ next: (r) => this.admins.set(r.items), error: () => {} });
    } else {
      const me = this.auth.admin();
      if (me) this.admins.set([{ _id: me.id, fullName: me.fullName + ' (me)' }]);
    }
  }

  load() {
    this.api.get<any>(`/disputes/${this.id}`).subscribe({
      next: (r) => { this.d.set(r.dispute); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  isKnownAdmin(id: string) {
    return this.admins().some((a) => a._id === id);
  }

  update(field: string, value: string) {
    this.api.put(`/disputes/${this.id}`, { [field]: value }).subscribe({
      next: () => { this.toast.success('Updated'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  assign(adminId: string) {
    if (!adminId) return;
    this.api.post(`/disputes/${this.id}/assign`, { adminId }).subscribe({
      next: () => { this.toast.success('Assigned'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  onFiles(e: Event) {
    this.files = Array.from((e.target as HTMLInputElement).files ?? []).slice(0, 5);
  }

  post() {
    if (!this.comment.trim() && !this.files.length) return;
    const fd = new FormData();
    fd.append('text', this.comment);
    this.files.forEach((f) => fd.append('attachments', f));
    this.posting.set(true);
    this.http.post(`${this.api.base}/disputes/${this.id}/comments`, fd).subscribe({
      next: () => { this.posting.set(false); this.comment = ''; this.files = []; this.load(); },
      error: (e) => { this.posting.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  openResolve() {
    this.resolution = { resolution: '', refundAmount: 0, refundTo: 'None', notes: '' };
    this.resolveOpen.set(true);
  }

  refundable() {
    const o = this.d()?.orderId;
    return o ? o.finalAmount - (o.refundedAmount || 0) : 0;
  }

  resolve() {
    if (this.resolution.resolution.trim().length < 3) return this.toast.warning('Describe the resolution');
    const amount = Number(this.resolution.refundAmount) || 0;
    if (amount > 0 && this.resolution.refundTo === 'None') return this.toast.warning('Choose who receives the refund');
    if (amount > this.refundable()) return this.toast.warning(`Maximum refundable is ₹${this.refundable()}`);
    this.busy.set(true);
    this.api.post<any>(`/disputes/${this.id}/resolve`, { ...this.resolution, refundAmount: amount }).subscribe({
      next: (r) => { this.busy.set(false); this.resolveOpen.set(false); this.toast.success(r.data.refundInitiated ? 'Resolved and refund initiated' : 'Dispute resolved'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async close() {
    if (!(await this.confirm.confirm('Close ticket?', 'Closed tickets cannot be edited unless reopened.', 'primary', 'Close ticket'))) return;
    this.api.post(`/disputes/${this.id}/close`).subscribe({ next: () => { this.toast.success('Closed'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  reopen() {
    this.api.post(`/disputes/${this.id}/reopen`).subscribe({ next: () => { this.toast.success('Reopened'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
