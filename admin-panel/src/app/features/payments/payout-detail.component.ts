import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { CanDirective, InrPipe, ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

const NEXT: Record<string, string[]> = { Pending: ['Processing', 'Completed', 'Failed', 'Rejected'], Processing: ['Completed', 'Failed'], Failed: ['Rejected'], Completed: [], Rejected: [] };

@Component({
  selector: 'app-payout-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, CanDirective],
  template: `
    <app-page-header [title]="p() ? 'Payout ' + p().payoutId : 'Payout'" back="/payments/payouts" backLabel="Payouts">
      @if (p(); as p) {
        <ng-container *appCan="'payouts.manage'">
          @for (s of next(); track s) {
            <button class="btn btn-sm" [class]="s === 'Completed' ? 'btn-success' : s === 'Processing' ? 'btn-outline-primary' : 'btn-outline-danger'" (click)="open(s)">Mark {{ s }}</button>
          }
          @if (p.status === 'Failed') { <button class="btn btn-sm btn-warning" (click)="retry()"><i class="bi bi-arrow-repeat me-1"></i>Retry</button> }
        </ng-container>
      }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (p(); as p) {
      <div class="row g-3">
        <div class="col-lg-5">
          <div class="card mb-3">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div><div class="small text-muted">Net amount</div><div class="fs-3 fw-bold">{{ p.amount | inr }}</div></div>
                <app-status-badge [status]="p.status" />
              </div>
              <hr />
              <dl class="dl-grid small">
                <dt>Seller</dt><dd><a [routerLink]="['/sellers', p.sellerId?._id]">{{ p.sellerId?.shopName }}</a><div class="text-muted">{{ p.sellerId?.ownerName }} · {{ p.sellerId?.mobileNumber }}</div></dd>
                <dt>Gross (online)</dt><dd>{{ p.grossAmount | inr }}</dd>
                <dt>Commission</dt><dd>-{{ p.commissionAmount | inr }}</dd>
                <dt>Cash commission</dt><dd>-{{ p.cashCommissionDeducted | inr }}</dd>
                <dt>Recoveries</dt><dd>-{{ p.refundDeducted | inr }}</dd>
                <dt>Payout date</dt><dd>{{ p.payoutDate | date: 'd MMM y' }}</dd>
                <dt>Initiated by</dt><dd>{{ p.initiatedBy?.fullName }} · {{ p.createdAt | date: 'd MMM y, h:mm a' }}</dd>
                <dt>UTR / Ref</dt><dd>{{ p.transactionRef || '—' }}</dd>
                @if (p.completedAt) { <dt>Completed</dt><dd>{{ p.completedAt | date: 'd MMM y, h:mm a' }}</dd> }
                @if (p.failureReason) { <dt>Failure</dt><dd class="text-danger">{{ p.failureReason }}</dd> }
                @if (p.notes) { <dt>Notes</dt><dd>{{ p.notes }}</dd> }
              </dl>
            </div>
          </div>
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Transfer to</span></div>
            <div class="card-body">
              <dl class="dl-grid small">
                <dt>Method</dt><dd>{{ p.payoutMethod }}</dd>
                <dt>Account holder</dt><dd>{{ p.bankDetails?.accountHolder || '—' }}</dd>
                <dt>Account no.</dt><dd><code class="ref">{{ p.bankDetails?.accountNumber || '—' }}</code></dd>
                <dt>IFSC</dt><dd>{{ p.bankDetails?.ifscCode || '—' }}</dd>
                <dt>Bank</dt><dd>{{ p.bankDetails?.bankName || '—' }}</dd>
                <dt>UPI</dt><dd>{{ p.upiId || '—' }}</dd>
              </dl>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Status history</span></div>
            <div class="card-body">
              <ul class="timeline">
                @for (h of p.statusHistory; track $index) { <li><app-status-badge [status]="h.status" /> <span class="small text-muted">{{ h.at | date: 'd MMM y, h:mm a' }}</span>@if (h.note) { <div class="small">{{ h.note }}</div> }</li> }
              </ul>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card">
            <div class="card-header"><span class="card-title">Orders in this payout ({{ p.orderIds?.length || 0 }})</span></div>
            <div class="table-responsive">
              <table class="table table-hover table-sm">
                <thead><tr><th>Order</th><th>Method</th><th class="text-end">Amount</th><th class="text-end">Refunded</th><th class="text-end">Comm. %</th><th>Delivered</th></tr></thead>
                <tbody>
                  @for (o of p.orderIds; track o._id) {
                    <tr class="row-link" [routerLink]="['/orders', o._id]">
                      <td><code class="ref">{{ o.orderId }}</code></td><td>{{ o.paymentMethod }}</td><td class="text-end">{{ o.finalAmount | inr }}</td>
                      <td class="text-end">{{ o.refundedAmount ? (o.refundedAmount | inr) : '—' }}</td><td class="text-end">{{ o.commissionRate }}%</td>
                      <td class="small">{{ o.deliveredAt ? (o.deliveredAt | date: 'd MMM y') : '—' }}</td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="text-center text-muted py-3">Orders were released (payout rejected)</td></tr> }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <app-modal [open]="!!action()" [title]="'Mark payout ' + action()" (closed)="action.set(null)">
        @if (action() === 'Completed') {
          <p class="small text-muted">Confirm that {{ p.amount | inr }} was transferred to the seller. Enter the bank UTR / reference number.</p>
          <label class="form-label required">UTR / transaction reference</label>
          <input class="form-control mb-3" [(ngModel)]="ref" placeholder="e.g. SBIN224567890123" />
        }
        @if (action() === 'Failed') {
          <label class="form-label required">Failure reason</label>
          <input class="form-control mb-3" [(ngModel)]="reason" placeholder="e.g. Account closed / wrong IFSC" />
        }
        @if (action() === 'Rejected') { <div class="alert alert-warning small">Rejecting releases the orders; they will appear again in the next payout run.</div> }
        <label class="form-label">Notes</label>
        <textarea class="form-control" rows="2" [(ngModel)]="note"></textarea>
        <div modal-footer class="modal-footer">
          <button class="btn btn-light" (click)="action.set(null)">Cancel</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="busy()">Confirm</button>
        </div>
      </app-modal>
    }
  `,
})
export class PayoutDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  p = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  action = signal<string | null>(null);
  ref = '';
  reason = '';
  note = '';
  next = computed(() => NEXT[this.p()?.status] ?? []);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/payouts/${this.id}`).subscribe({
      next: (p) => { this.p.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  open(status: string) {
    this.ref = this.p().transactionRef || '';
    this.reason = '';
    this.note = '';
    this.action.set(status);
  }

  save() {
    const status = this.action()!;
    if (status === 'Completed' && !this.ref.trim()) return this.toast.warning('UTR / reference is required');
    if (status === 'Failed' && !this.reason.trim()) return this.toast.warning('Enter the failure reason');
    this.busy.set(true);
    this.api.put(`/payouts/${this.id}/status`, { status, transactionRef: this.ref, failureReason: this.reason, notes: this.note }).subscribe({
      next: () => { this.busy.set(false); this.action.set(null); this.toast.success(`Payout marked ${status}`); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async retry() {
    if (!(await this.confirm.confirm('Retry payout?', 'The payout goes back to Pending so you can transfer again.', 'warning', 'Retry'))) return;
    this.api.post(`/payouts/${this.id}/retry`).subscribe({ next: () => { this.toast.success('Payout set to pending'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
