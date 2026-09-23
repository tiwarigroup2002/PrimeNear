import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { CanDirective, ModalComponent, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

export const DISPUTE_CATEGORIES = ['ProductQuality', 'LateDelivery', 'PaymentIssue', 'Fraud', 'Other'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

@Component({
  selector: 'app-dispute-list',
  imports: [FormsModule, DatePipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, ModalComponent, CanDirective],
  template: `
    <app-page-header title="Disputes & support" icon="bi-life-preserver" subtitle="Complaints raised by users and sellers">
      <button *appCan="'disputes.manage'" class="btn btn-sm btn-primary" (click)="openCreate()"><i class="bi bi-plus-lg me-1"></i>New ticket</button>
    </app-page-header>
    <div class="row g-3 mb-3">
      @for (c of [['Open', 'openCount', 'danger'], ['InProgress', 'pendingCount', 'warning'], ['Resolved', 'resolvedCount', 'success'], ['Closed', 'closedCount', 'secondary']]; track c[0]) {
        <div class="col-6 col-md-3">
          <div class="card row-link" [class.border-primary]="list.filters['status'] === c[0]" (click)="list.filters['status'] = list.filters['status'] === c[0] ? '' : c[0]; list.apply()">
            <div class="card-body py-2"><div class="small text-muted"><app-status-badge [status]="c[0]" /></div><div class="fs-4 fw-semibold text-{{ c[2] }}">{{ list.extra()[c[1]] ?? 0 }}</div></div>
          </div>
        </div>
      }
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control form-control-sm search" placeholder="Ticket ID or title" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" />
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['priority']" (change)="list.apply()"><option value="">Any priority</option>@for (p of priorities; track p) { <option>{{ p }}</option> }</select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['category']" (change)="list.apply()"><option value="">Any category</option>@for (c of categories; track c) { <option>{{ c }}</option> }</select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['assignedTo']" (change)="list.apply()"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['sortBy']" (change)="list.apply()"><option value="">Newest</option><option value="priority">Priority</option></select>
      </div>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>Ticket</th><th>Title</th><th>Reported by</th><th>Against</th><th>Order</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Created</th></tr></thead>
          <tbody>
            @for (d of list.items(); track d._id) {
              <tr class="row-link" (click)="router.navigate(['/disputes', d._id])">
                <td><code class="ref">{{ d.ticketId }}</code></td>
                <td><div class="cell-title">{{ d.title }}</div><div class="cell-sub">{{ d.category }}</div></td>
                <td>{{ d.reportedBy }}<div class="cell-sub">{{ d.reportedById?.name || d.reportedById?.shopName || '' }}</div></td>
                <td>@if (d.againstId) { {{ d.againstType }}<div class="cell-sub">{{ d.againstId?.name || d.againstId?.shopName }}</div> } @else { — }</td>
                <td>{{ d.orderId?.orderId || '—' }}</td>
                <td><app-status-badge [status]="d.priority" /></td>
                <td><app-status-badge [status]="d.status" /></td>
                <td>{{ d.assignedToAdmin?.fullName || '—' }}</td>
                <td class="small">{{ d.createdAt | date: 'd MMM y' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No disputes 🎉" icon="bi-emoji-smile" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-modal [open]="createOpen()" title="New dispute / support ticket" size="lg" (closed)="createOpen.set(false)">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Order ID (optional)</label><input class="form-control" [(ngModel)]="form.orderId" placeholder="ORD-20240923-00001" /></div>
        <div class="col-md-3"><label class="form-label">Raised by</label><select class="form-select" [(ngModel)]="form.reportedBy"><option>User</option><option>Seller</option><option>Admin</option></select></div>
        <div class="col-md-3"><label class="form-label">Against</label><select class="form-select" [(ngModel)]="form.againstType"><option>None</option><option>Seller</option><option>User</option></select></div>
        <div class="col-md-6"><label class="form-label">Category</label><select class="form-select" [(ngModel)]="form.category">@for (c of categories; track c) { <option>{{ c }}</option> }</select></div>
        <div class="col-md-6"><label class="form-label">Priority</label><select class="form-select" [(ngModel)]="form.priority">@for (p of priorities; track p) { <option>{{ p }}</option> }</select></div>
        <div class="col-12"><label class="form-label required">Title</label><input class="form-control" [(ngModel)]="form.title" /></div>
        <div class="col-12"><label class="form-label required">Description</label><textarea class="form-control" rows="4" [(ngModel)]="form.description"></textarea></div>
        <div class="col-12 small text-muted">With an order ID, the user and seller of that order are filled in automatically.</div>
      </div>
      <div modal-footer class="modal-footer">
        <button class="btn btn-light" (click)="createOpen.set(false)">Cancel</button>
        <button class="btn btn-primary" (click)="create()" [disabled]="saving()">Create ticket</button>
      </div>
    </app-modal>
  `,
})
export class DisputeListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  router = inject(Router);
  categories = DISPUTE_CATEGORIES;
  priorities = PRIORITIES;
  list = new PagedList<any>('/disputes', { search: '', status: '', priority: '', category: '', assignedTo: '', sortBy: '' });
  createOpen = signal(false);
  saving = signal(false);
  form: any = {};

  ngOnInit() {
    this.list.load();
  }

  openCreate() {
    this.form = { orderId: '', reportedBy: 'User', againstType: 'Seller', category: 'Other', priority: 'Medium', title: '', description: '' };
    this.createOpen.set(true);
  }

  create() {
    if (this.form.title.trim().length < 3 || this.form.description.trim().length < 5) return this.toast.warning('Enter a title and description');
    if (!this.form.orderId && this.form.reportedBy !== 'Admin') return this.toast.warning('Enter the order ID so we know who raised it (or choose "Admin")');
    this.saving.set(true);
    this.api.post<any>('/disputes', this.form).subscribe({
      next: (r) => { this.saving.set(false); this.createOpen.set(false); this.toast.success('Ticket created'); this.router.navigate(['/disputes', r.data._id]); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
