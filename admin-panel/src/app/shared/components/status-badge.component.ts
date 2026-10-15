import { Component, Input } from '@angular/core';

const COLORS: Record<string, string> = {
  // generic
  Active: 'success', Inactive: 'secondary', Blocked: 'danger', Deleted: 'dark',
  // orders
  Pending: 'warning', Confirmed: 'info', Packed: 'primary', Shipped: 'primary', Delivered: 'success', Cancelled: 'danger', Returned: 'secondary',
  // payments
  Completed: 'success', Failed: 'danger', Refunded: 'secondary', PartiallyRefunded: 'info', Success: 'success', Processed: 'success',
  // payouts
  Processing: 'info', Rejected: 'dark',
  // disputes
  Open: 'danger', InProgress: 'warning', Resolved: 'success', Closed: 'secondary',
  Low: 'secondary', Medium: 'info', High: 'warning', Critical: 'danger',
  // settlement
  Unsettled: 'warning', InPayout: 'info', Settled: 'success', NotApplicable: 'secondary',
  // subscription bills
  Draft: 'secondary', Issued: 'warning', Paid: 'success',
  // login
  Locked: 'dark',
  // roles
  SuperAdmin: 'danger', Admin: 'primary', SupportAdmin: 'info',
};

const LABELS: Record<string, string> = { PartiallyRefunded: 'Partly refunded', InProgress: 'In progress', NotApplicable: 'N/A', InPayout: 'In payout', SuperAdmin: 'Super Admin', SupportAdmin: 'Support Admin' };

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge rounded-pill bg-{{ color }}-subtle text-{{ color }}-emphasis border border-{{ color }}-subtle">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input() status: string | null | undefined = '';
  get color() {
    return COLORS[this.status ?? ''] ?? 'secondary';
  }
  get label() {
    return LABELS[this.status ?? ''] ?? this.status ?? '-';
  }
}
