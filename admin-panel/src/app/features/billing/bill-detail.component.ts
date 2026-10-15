import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { BillViewComponent, CanDirective, InrPipe, ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-bill-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, CanDirective, BillViewComponent],
  template: `
    <app-page-header [title]="b()?.invoiceNumber ? 'Bill ' + b().invoiceNumber : 'Draft bill'" icon="bi-receipt-cutoff" back="/subscription-bills" backLabel="Subscription bills">
      @if (b(); as b) {
        <button class="btn btn-sm btn-outline-secondary" (click)="print()"><i class="bi bi-printer me-1"></i>Print</button>
        <button class="btn btn-sm btn-outline-secondary" (click)="pdf()"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
        <ng-container *appCan="'billing.manage'">
          @if (b.status === 'Draft') {
            <button class="btn btn-sm btn-outline-danger" (click)="remove()"><i class="bi bi-trash me-1"></i>Delete</button>
            <a class="btn btn-sm btn-outline-primary" [routerLink]="['/subscription-bills', b._id, 'edit']"><i class="bi bi-pencil me-1"></i>Edit</a>
            <button class="btn btn-sm btn-primary" (click)="issue()" [disabled]="busy()"><i class="bi bi-send me-1"></i>Issue to seller</button>
          }
          @if (b.status === 'Issued') {
            <button class="btn btn-sm btn-outline-danger" (click)="cancel()"><i class="bi bi-x-circle me-1"></i>Cancel bill</button>
            <button class="btn btn-sm btn-success" (click)="openPaid()"><i class="bi bi-check2-circle me-1"></i>Mark paid</button>
          }
          @if (b.status === 'Paid') {
            <button class="btn btn-sm btn-outline-danger" (click)="cancel()"><i class="bi bi-x-circle me-1"></i>Cancel bill</button>
          }
        </ng-container>
      }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (b(); as b) {
      <div class="row g-3">
        <div class="col-lg-8 order-2 order-lg-1"><div id="bill-print"><app-bill-view [b]="b" [t]="t()" /></div></div>
        <div class="col-lg-4 order-1 order-lg-2">
          <div class="card">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div><div class="small text-muted">Total</div><div class="fs-3 fw-bold">{{ b.total | inr }}</div></div>
                <app-status-badge [status]="b.status" />
              </div>
              <hr />
              <dl class="dl-grid small">
                <dt>Seller</dt><dd><a [routerLink]="['/sellers', b.sellerId?._id]">{{ b.sellerId?.shopName }}</a><div class="text-muted">{{ b.sellerId?.mobileNumber }}</div></dd>
                <dt>GST</dt><dd>{{ b.taxMode === 'intra' ? 'CGST + SGST' : b.taxMode === 'inter' ? 'IGST' : 'No GST' }}</dd>
                <dt>Created</dt><dd>{{ b.createdAt | date: 'd MMM y, h:mm a' }}</dd>
                @if (b.issuedAt) { <dt>Issued</dt><dd>{{ b.issuedAt | date: 'd MMM y, h:mm a' }}</dd> }
                @if (b.paidAt) { <dt>Paid</dt><dd>{{ b.paidAt | date: 'd MMM y' }} · {{ b.paymentMethod }}@if (b.paymentRef) { <div class="text-muted">Ref: {{ b.paymentRef }}</div> }</dd> }
                @if (b.cancelledAt) { <dt>Cancelled</dt><dd>{{ b.cancelledAt | date: 'd MMM y' }}<div class="text-danger">{{ b.cancelReason }}</div></dd> }
              </dl>
              @if (b.status === 'Draft') { <div class="alert alert-light small mb-0">Draft bills are not visible to the seller. Issuing gives the bill its number and sends it to the seller.</div> }
              @if (b.status !== 'Draft') { <div class="small text-muted">The bill design was frozen when this bill was issued; later design changes do not change it.</div> }
            </div>
          </div>
        </div>
      </div>

      <app-modal [open]="paidOpen()" title="Mark bill paid" (closed)="paidOpen.set(false)">
        <p class="small text-muted">Record that {{ b.total | inr }} was received from {{ b.billTo?.name }}.</p>
        <label class="form-label required">Payment method</label>
        <select class="form-select mb-2" [(ngModel)]="pay.paymentMethod">
          @for (m of methods; track m) { <option>{{ m }}</option> }
        </select>
        <label class="form-label">Received on</label>
        <input type="date" class="form-control mb-2" [(ngModel)]="pay.paidAt" />
        <label class="form-label">UTR / reference</label>
        <input class="form-control" [(ngModel)]="pay.paymentRef" placeholder="Optional" />
        <div modal-footer class="modal-footer">
          <button class="btn btn-light" (click)="paidOpen.set(false)">Close</button>
          <button class="btn btn-success" (click)="markPaid()" [disabled]="busy()">Mark paid</button>
        </div>
      </app-modal>
    }
  `,
})
export class BillDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  b = signal<any>(null);
  t = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  paidOpen = signal(false);
  methods = ['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Adjusted in payout', 'Other'];
  pay = { paymentMethod: 'Bank transfer', paidAt: '', paymentRef: '' };

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/subscription-bills/${this.id}`).subscribe({
      next: ({ bill, template }) => { this.b.set(bill); this.t.set(template); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private run(req: any, after?: () => void) {
    this.busy.set(true);
    req.subscribe({
      next: (r: any) => { this.busy.set(false); this.toast.success(r?.message || 'Done'); after ? after() : this.load(); },
      error: (e: any) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async issue() {
    if (!(await this.confirm.confirm('Issue this bill?', `It gets the next bill number and ${this.b().billTo?.name} can see it in the seller app. Issued bills cannot be edited.`, 'primary', 'Issue'))) return;
    this.run(this.api.post(`/subscription-bills/${this.id}/issue`));
  }

  openPaid() {
    this.pay = { paymentMethod: 'Bank transfer', paidAt: new Date().toISOString().slice(0, 10), paymentRef: '' };
    this.paidOpen.set(true);
  }

  markPaid() {
    const body: any = { paymentMethod: this.pay.paymentMethod, paymentRef: this.pay.paymentRef };
    if (this.pay.paidAt) body.paidAt = this.pay.paidAt;
    this.run(this.api.post(`/subscription-bills/${this.id}/mark-paid`, body), () => { this.paidOpen.set(false); this.load(); });
  }

  async cancel() {
    const reason = await this.confirm.prompt('Cancel bill?', 'The bill stays in the list as Cancelled. Its number is not reused.', 'Reason', 'Cancel bill');
    if (reason === null) return;
    this.run(this.api.post(`/subscription-bills/${this.id}/cancel`, { reason }));
  }

  async remove() {
    if (!(await this.confirm.confirm('Delete draft?', 'This draft bill will be removed.', 'danger', 'Delete'))) return;
    this.run(this.api.delete(`/subscription-bills/${this.id}`), () => this.router.navigate(['/subscription-bills']));
  }

  pdf() {
    const b = this.b();
    this.api.download(`/subscription-bills/${this.id}/pdf`, `${(b.invoiceNumber || 'draft-bill').replace(/\//g, '-')}.pdf`).subscribe({ error: (e) => this.toast.error(errorMessage(e)) });
  }

  /** Prints only the bill (opens it in a clean window) */
  print() {
    const html = document.getElementById('bill-print')?.innerHTML || '';
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((s) => s.outerHTML).join('');
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return this.toast.warning('Allow pop-ups to print');
    w.document.write(`<html><head><title>${this.b().invoiceNumber || 'Bill'}</title>${styles}<style>body{background:#fff;padding:16px}.bill{border:0}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  }
}
