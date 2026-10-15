import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { BillViewComponent, PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-subscription-bill',
  imports: [PageHeaderComponent, StateComponent, BillViewComponent],
  template: `
    <app-page-header [title]="b()?.invoiceNumber || 'Bill'" back="/subscription-bills">
      @if (b()) { <button class="btn btn-sm btn-primary" (click)="pdf()" [disabled]="busy()"><i class="bi bi-download me-1"></i>PDF</button> }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (b(); as b) {
      @if (b.status === 'Paid') { <div class="alert alert-success small"><i class="bi bi-check2-circle me-1"></i>Paid{{ b.paymentMethod ? ' by ' + b.paymentMethod : '' }}. Thank you!</div> }
      @if (b.status === 'Cancelled') { <div class="alert alert-danger small">This bill was cancelled{{ b.cancelReason ? ': ' + b.cancelReason : '' }}.</div> }
      <div style="overflow-x: auto"><app-bill-view [b]="b" [t]="t()" /></div>
    }
  `,
})
export class SubscriptionBillComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  b = signal<any>(null);
  t = signal<any>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    this.api.get<any>(`/subscription-bills/${this.id}`).subscribe({
      next: ({ bill, template }) => { this.b.set(bill); this.t.set(template); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  pdf() {
    this.busy.set(true);
    this.api.download(`/subscription-bills/${this.id}/pdf`, `${String(this.b().invoiceNumber).replace(/\//g, '-')}.pdf`).subscribe({
      next: () => this.busy.set(false),
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
