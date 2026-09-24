import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-invoice-view',
  imports: [DatePipe, RouterLink, InrPipe, PageHeaderComponent, StateComponent],
  template: `
    <app-page-header [title]="inv()?.invoiceId || 'Invoice'" back="/invoices" backLabel="Invoices" class="no-print" />
    <app-state [loading]="!inv() && !error()" [error]="error()" />
    @if (inv(); as i) {
      @if (isNew) {
        <div class="alert alert-success d-flex align-items-center gap-2 no-print"><i class="bi bi-check-circle-fill fs-4"></i><div><strong>Bill created!</strong> Share it with the customer.</div></div>
      }
      <div class="d-grid d-sm-flex gap-2 mb-3 no-print">
        <button class="btn btn-success" (click)="share('whatsapp')"><i class="bi bi-whatsapp me-1"></i>Share on WhatsApp</button>
        <button class="btn btn-outline-secondary" (click)="print()"><i class="bi bi-printer me-1"></i>Print</button>
        <button class="btn btn-outline-secondary" (click)="pdf()"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
        @if (i.customerSnapshot?.mobileNumber) { <button class="btn btn-outline-secondary" (click)="share('sms')"><i class="bi bi-chat-text me-1"></i>SMS</button> }
        <a routerLink="/billing" class="btn btn-primary ms-sm-auto"><i class="bi bi-plus-lg me-1"></i>New bill</a>
      </div>

      <div class="card invoice-paper shadow-sm">
        <div class="card-body p-3 p-md-4">
          <div class="text-center mb-3">
            <h2 class="h4 fw-bold mb-0">{{ shop()?.shopName }}</h2>
            <div class="small">{{ shop()?.shopAddress }}</div>
            <div class="small">Mobile: {{ shop()?.mobileNumber }} @if (shop()?.gstNumber) { · GSTIN: {{ shop()?.gstNumber }} }</div>
            <div class="fw-semibold mt-2">TAX INVOICE</div>
          </div>
          <div class="d-flex justify-content-between small border-top border-bottom py-2 mb-2 flex-wrap gap-2">
            <div><div><strong>Invoice:</strong> {{ i.invoiceId }}</div><div><strong>Date:</strong> {{ i.invoiceDate | date: 'd MMM y, h:mm a' }}</div><div><strong>Payment:</strong> {{ i.paymentMethod }}</div></div>
            <div class="text-end"><div><strong>Customer:</strong> {{ i.customerSnapshot?.name || 'Walk-in customer' }}</div>@if (i.customerSnapshot?.mobileNumber) { <div>{{ i.customerSnapshot.mobileNumber }}</div> }</div>
          </div>
          <div class="table-responsive"><table class="table table-sm small mb-2 invoice-table" style="--bs-table-bg: transparent; color: inherit">
            <thead><tr><th>Item</th><th class="text-center">Qty</th><th class="text-end">Rate</th><th class="text-end">GST</th><th class="text-end">Amount</th></tr></thead>
            <tbody>
              @for (it of i.items; track $index) {
                <tr><td>{{ it.productName }}</td><td class="text-center">{{ it.quantity }}</td><td class="text-end">{{ it.price | inr }}</td><td class="text-end">{{ it.gst | inr }}<div class="text-muted" style="font-size: .7rem">{{ it.gstRate }}%</div></td><td class="text-end">{{ it.subtotal | inr }}</td></tr>
              }
            </tbody>
          </table></div>
          <div class="ms-auto small" style="max-width: 260px">
            <div class="d-flex justify-content-between"><span>Subtotal</span><span>{{ i.subtotal | inr }}</span></div>
            <div class="d-flex justify-content-between"><span>GST</span><span>{{ i.totalGst | inr }}</span></div>
            @if (i.deliveryCharge) { <div class="d-flex justify-content-between"><span>Delivery</span><span>{{ i.deliveryCharge | inr }}</span></div> }
            @if (i.discount) { <div class="d-flex justify-content-between"><span>Discount</span><span>-{{ i.discount | inr }}</span></div> }
            <div class="d-flex justify-content-between fw-bold fs-6 border-top mt-1 pt-1"><span>TOTAL</span><span>{{ i.totalAmount | inr }}</span></div>
          </div>
          @if (i.notes) { <div class="small mt-3"><strong>Note:</strong> {{ i.notes }}</div> }
          <div class="text-center small mt-4">धन्यवाद! Thank you for shopping with us 🙏</div>
        </div>
      </div>
      @if (i.orderId) { <div class="text-center mt-3 no-print"><a [routerLink]="['/orders', i.orderId._id]" class="small">View order {{ i.orderId.orderId }}</a></div> }
    }
  `,
})
export class InvoiceViewComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  shop = this.auth.seller;
  isNew = inject(ActivatedRoute).snapshot.queryParamMap.has('new');
  inv = signal<any>(null);
  error = signal<string | null>(null);

  ngOnInit() {
    this.api.get<any>(`/invoices/${this.id}`).subscribe({ next: (r) => this.inv.set(r.invoice), error: (e) => this.error.set(errorMessage(e)) });
  }

  share(channel: 'whatsapp' | 'sms') {
    // Open the window synchronously so mobile browsers don't block the popup
    const win = channel === 'whatsapp' ? window.open('', '_blank') : null;
    this.api.post<any>(`/invoices/${this.inv()._id}/share`, { channel }).subscribe({
      next: (r) => {
        if (channel === 'whatsapp' && r.data.url) {
          if (win) win.location.href = r.data.url;
          else location.href = r.data.url;
        } else this.toast.success(r.message || 'Sent');
      },
      error: (e) => { win?.close(); this.toast.error(errorMessage(e)); },
    });
  }

  print() {
    window.print();
  }

  pdf() {
    this.http.get(`${this.api.base}/invoices/${this.inv()._id}/pdf`, { responseType: 'blob' }).subscribe({
      next: (b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.inv().invoiceId}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => this.toast.error('Could not download PDF'),
    });
  }
}
