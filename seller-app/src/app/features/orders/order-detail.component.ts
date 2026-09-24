import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

const FLOW = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
const NEXT: Record<string, { status: string; label: string; icon: string }> = {
  Pending: { status: 'Confirmed', label: 'Accept order', icon: 'bi-check2-circle' },
  Confirmed: { status: 'Packed', label: 'Mark packed', icon: 'bi-box-seam' },
  Packed: { status: 'Shipped', label: 'Out for delivery', icon: 'bi-truck' },
  Shipped: { status: 'Delivered', label: 'Mark delivered', icon: 'bi-house-check' },
};

@Component({
  selector: 'app-order-detail',
  imports: [DatePipe, FormsModule, InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header [title]="o()?.orderId || 'Order'" back="/orders" backLabel="Orders" />
    <app-state [loading]="!o() && !error()" [error]="error()" />
    @if (o(); as o) {
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div><app-status-badge [status]="o.orderStatus" /> <app-status-badge [status]="o.paymentStatus" />
              <div class="small text-muted mt-1">{{ o.createdAt | date: 'd MMM y, h:mm a' }} · {{ o.source === 'POS' ? 'Counter bill' : 'App order' }} · {{ o.paymentMethod }}</div></div>
            <div class="text-end"><div class="fs-4 fw-bold">{{ o.finalAmount | inr }}</div></div>
          </div>
          @if (o.orderStatus === 'Cancelled') {
            <div class="alert alert-danger small mb-0">Cancelled: {{ o.cancelReason }}</div>
          } @else if (o.source !== 'POS') {
            <div class="status-flow my-3">
              @for (s of flow; track s; let i = $index) {
                <div class="step" [class.done]="i < idx() || (i === idx() && s === 'Delivered')" [class.current]="i === idx() && s !== 'Delivered'">
                  <div class="dot">@if (i <= idx()) { <i class="bi bi-check-lg small"></i> } @else { {{ i + 1 }} }</div><div>{{ s }}</div>
                </div>
              }
            </div>
          }
          @if (next(); as n) {
            <div class="d-grid gap-2 d-sm-flex">
              <button class="btn btn-primary btn-lg flex-grow-1" (click)="move(n.status)" [disabled]="busy()"><i class="bi {{ n.icon }} me-1"></i>{{ n.label }}</button>
              <button class="btn btn-outline-danger" (click)="cancel()" [disabled]="busy()">Cancel order</button>
            </div>
          }
        </div>
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Items</span></div>
            <div class="m-list">
              @for (it of o.items; track $index) {
                <div class="m-item">
                  @if (it.image) { <img [src]="it.image" class="thumb" alt="" /> } @else { <span class="thumb"><i class="bi bi-box"></i></span> }
                  <span class="flex-grow-1 min-w-0"><span class="d-block small fw-semibold">{{ it.productName }}</span><span class="cell-sub">{{ it.quantity }} × {{ it.price | inr }} + GST {{ it.gstRate }}%</span></span>
                  <span class="fw-semibold small">{{ it.subtotal | inr }}</span>
                </div>
              }
            </div>
            <div class="card-body border-top small">
              <div class="d-flex justify-content-between"><span>Subtotal</span><span>{{ o.subtotal | inr }}</span></div>
              <div class="d-flex justify-content-between"><span>GST</span><span>{{ o.gstAmount | inr }}</span></div>
              @if (o.deliveryCharge) { <div class="d-flex justify-content-between"><span>Delivery</span><span>{{ o.deliveryCharge | inr }}</span></div> }
              @if (o.discount) { <div class="d-flex justify-content-between"><span>Discount</span><span>-{{ o.discount | inr }}</span></div> }
              <div class="d-flex justify-content-between fw-bold"><span>Total</span><span>{{ o.finalAmount | inr }}</span></div>
              @if (o.refundedAmount) { <div class="d-flex justify-content-between text-danger"><span>Refunded</span><span>-{{ o.refundedAmount | inr }}</span></div> }
              <div class="d-flex justify-content-between text-muted mt-1"><span>Platform commission ({{ o.commissionRate }}%)</span><span>{{ o.commissionAmount | inr }}</span></div>
            </div>
          </div>
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Notes (only for your team)</span></div>
            <div class="card-body">
              @for (n of o.notes; track n._id) { <div class="small border-bottom pb-1 mb-1">{{ n.text }} <span class="text-muted">· {{ n.byName }} · {{ n.at | date: 'd MMM, h:mm a' }}</span></div> }
              <div class="input-group mt-2"><input class="form-control" placeholder="e.g. Pack in black paper" [(ngModel)]="note" (keyup.enter)="addNote()" /><button class="btn btn-outline-primary" (click)="addNote()">Add</button></div>
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Customer</span></div>
            <div class="card-body">
              <div class="fw-semibold">{{ o.userId?.name || o.customerSnapshot?.name || 'Walk-in customer' }}</div>
              <div class="small text-muted">{{ phone() || 'No mobile' }}</div>
              @if (o.deliveryAddress?.fullAddress) { <div class="small mt-2"><i class="bi bi-geo-alt me-1"></i>{{ o.deliveryAddress.fullAddress }}, {{ o.deliveryAddress.city }} {{ o.deliveryAddress.zipCode }}</div> }
              @if (o.customerNote) { <div class="small mt-2 text-muted">Note: {{ o.customerNote }}</div> }
              @if (phone()) {
                <div class="d-flex gap-2 mt-3">
                  <a class="btn btn-sm btn-outline-secondary flex-fill" [href]="'tel:' + phone()"><i class="bi bi-telephone me-1"></i>Call</a>
                  <a class="btn btn-sm btn-outline-success flex-fill" [href]="'https://wa.me/91' + phone() + '?text=' + wa()" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a>
                </div>
              }
            </div>
          </div>
          @if (o.orderStatus !== 'Cancelled') {
            <button class="btn btn-outline-primary w-100 mb-3" (click)="invoice()"><i class="bi bi-file-earmark-text me-1"></i>{{ o.invoiceId ? 'View invoice' : 'Generate invoice' }}</button>
          }
          <div class="card">
            <div class="card-header"><span class="card-title">History</span></div>
            <div class="card-body">
              <ul class="timeline">
                @for (h of o.statusHistory; track $index) { <li><app-status-badge [status]="h.status" /> <span class="small text-muted">{{ h.at | date: 'd MMM, h:mm a' }} · {{ h.byName || h.byType }}</span>@if (h.note) { <div class="small">{{ h.note }}</div> }</li> }
              </ul>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class OrderDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  o = signal<any>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  note = '';
  flow = FLOW;

  idx = computed(() => FLOW.indexOf(this.o()?.orderStatus));
  next = computed(() => (this.o()?.source === 'POS' ? null : NEXT[this.o()?.orderStatus]));
  phone = computed(() => this.o()?.userId?.mobileNumber || this.o()?.customerSnapshot?.mobileNumber);
  wa = computed(() => encodeURIComponent(`नमस्ते! आपके ऑर्डर ${this.o()?.orderId} के बारे में`));

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/orders/${this.id}`).subscribe({ next: (r) => this.o.set(r.order), error: (e) => this.error.set(errorMessage(e)) });
  }

  move(status: string) {
    this.busy.set(true);
    this.api.put<any>(`/orders/${this.id}/status`, { status }).subscribe({
      next: (r) => { this.busy.set(false); this.toast.success(r.message || 'Updated'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async cancel() {
    const paid = this.o().paymentStatus === 'Completed';
    const reason = await this.confirm.prompt('Cancel order?', `Items go back to stock.${paid ? ' The customer will get a full refund.' : ''}`, 'Reason (sent to the customer)', 'Cancel order');
    if (reason === null) return;
    this.api.post(`/orders/${this.id}/cancel`, { reason }).subscribe({ next: () => { this.toast.success('Order cancelled'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  addNote() {
    if (!this.note.trim()) return;
    this.api.put(`/orders/${this.id}/add-note`, { note: this.note }).subscribe({ next: () => { this.note = ''; this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  invoice() {
    this.api.get<any>(`/orders/${this.id}/invoice`).subscribe({ next: (r) => this.router.navigate(['/invoices', r.invoice._id]), error: (e) => this.toast.error(errorMessage(e)) });
  }
}
