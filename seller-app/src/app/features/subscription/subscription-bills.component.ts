import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

/** Subscription bills PrimeNear has issued to this shop. */
@Component({
  selector: 'app-subscription-bills',
  imports: [DatePipe, RouterLink, InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="PrimeNear bills" subtitle="Subscription bills from PrimeNear" />
    @if (outstanding() > 0) {
      <div class="alert alert-warning d-flex align-items-center gap-2"><i class="bi bi-hourglass-split"></i><span>Amount due: <b>{{ outstanding() | inr }}</b></span></div>
    }
    <div class="card">
      <div class="m-list">
        @for (b of items(); track b._id) {
          <a class="m-item" [routerLink]="['/subscription-bills', b._id]">
            <span class="thumb"><i class="bi bi-receipt-cutoff"></i></span>
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold small text-truncate">{{ b.planName || 'Subscription' }}</span>
              <span class="cell-sub">{{ b.invoiceNumber }} · {{ b.invoiceDate | date: 'd MMM y' }}@if (b.status === 'Issued' && b.dueDate) { · due {{ b.dueDate | date: 'd MMM' }} }</span>
            </span>
            <span class="text-end"><span class="d-block fw-semibold">{{ b.total | inr }}</span><app-status-badge [status]="b.status" /></span>
          </a>
        }
      </div>
      <app-state [loading]="loading()" [error]="error()" [empty]="!loading() && !items().length" emptyText="No bills from PrimeNear yet" icon="bi-receipt-cutoff" />
    </div>
  `,
})
export class SubscriptionBillsComponent implements OnInit {
  private api = inject(ApiService);
  items = signal<any[]>([]);
  outstanding = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.api.get<any>('/subscription-bills').subscribe({
      next: (d) => { this.items.set(d.items); this.outstanding.set(d.outstanding || 0); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
}
