import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { CanDirective, InrPipe, ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';
import { ORDER_STATUSES } from './order-list.component';

const FLOW = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];

@Component({
  selector: 'app-order-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, CanDirective],
  templateUrl: './order-detail.component.html',
})
export class OrderDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  data = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  flow = FLOW;
  statuses = ORDER_STATUSES.filter((s) => s !== 'Cancelled');

  statusOpen = signal(false);
  newStatus = '';
  statusNote = '';

  refundOpen = signal(false);
  refundAmount: number | null = null;
  refundReason = '';

  cancelOpen = signal(false);
  cancelReason = '';
  cancelRefund = true;

  note = '';

  order = computed(() => this.data()?.order);
  isOpen = computed(() => ['Pending', 'Confirmed', 'Packed', 'Shipped'].includes(this.order()?.orderStatus));
  canRefund = computed(() => ['Completed', 'PartiallyRefunded'].includes(this.order()?.paymentStatus) && this.data()?.refundableAmount > 0);
  stepIndex = computed(() => FLOW.indexOf(this.order()?.orderStatus));
  customerPhone = computed(() => this.order()?.userId?.mobileNumber || this.order()?.customerSnapshot?.mobileNumber);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/orders/${this.id}`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  historyAt(status: string) {
    return this.order()?.statusHistory?.find((h: any) => h.status === status)?.at;
  }

  openStatus() {
    this.newStatus = '';
    this.statusNote = '';
    this.statusOpen.set(true);
  }

  saveStatus() {
    if (!this.newStatus) return this.toast.warning('Select a status');
    this.busy.set(true);
    this.api.put(`/orders/${this.id}/status`, { status: this.newStatus, notes: this.statusNote }).subscribe({
      next: () => { this.busy.set(false); this.statusOpen.set(false); this.toast.success(`Order marked ${this.newStatus}`); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  openRefund() {
    this.refundAmount = this.data().refundableAmount;
    this.refundReason = '';
    this.refundOpen.set(true);
  }

  saveRefund() {
    const amt = Number(this.refundAmount);
    if (!amt || amt <= 0 || amt > this.data().refundableAmount) return this.toast.warning(`Amount must be between 1 and ${this.data().refundableAmount}`);
    if (this.refundReason.trim().length < 3) return this.toast.warning('Enter a reason');
    this.busy.set(true);
    this.api.post(`/orders/${this.id}/refund`, { amount: amt, reason: this.refundReason }).subscribe({
      next: () => { this.busy.set(false); this.refundOpen.set(false); this.toast.success('Refund initiated'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  saveCancel() {
    if (this.cancelReason.trim().length < 3) return this.toast.warning('Enter a reason');
    this.busy.set(true);
    this.api.post(`/orders/${this.id}/cancel`, { reason: this.cancelReason, refund: this.cancelRefund }).subscribe({
      next: () => { this.busy.set(false); this.cancelOpen.set(false); this.toast.success('Order cancelled'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  addNote() {
    if (!this.note.trim()) return;
    this.api.post(`/orders/${this.id}/notes`, { note: this.note }).subscribe({
      next: () => { this.note = ''; this.toast.success('Note added'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  print() {
    window.print();
  }
}
