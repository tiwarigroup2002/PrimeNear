import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, SheetComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-customer-detail',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent, SheetComponent],
  template: `
    <app-page-header title="Customer" back="/customers" backLabel="Customers">
      @if (d()) { <button class="btn btn-sm btn-outline-danger" (click)="remove()"><i class="bi bi-person-dash"></i></button> }
    </app-page-header>
    <app-state [loading]="!d() && !error()" [error]="error()" />
    @if (d(); as d) {
      <div class="card mb-3"><div class="card-body d-flex align-items-center gap-3">
        <span class="shop-avatar shop-avatar-initial" style="width:56px;height:56px;border-radius:50%;font-size:1.4rem">{{ (d.customer.name || '?').slice(0, 1).toUpperCase() }}</span>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold fs-5">{{ d.customer.name || 'Customer' }}</div>
          <div class="text-muted small">{{ d.customer.mobileNumber }} @if (d.customer.email) { · {{ d.customer.email }} }</div>
          @if (d.customer.address) { <div class="small">{{ d.customer.address }}</div> }
          <div class="small text-muted">Customer since {{ d.customer.createdAt | date: 'MMM y' }}</div>
        </div>
        <button class="btn btn-sm btn-light" (click)="openEdit()"><i class="bi bi-pencil"></i></button>
      </div>
      <div class="card-footer d-flex gap-2">
        <a class="btn btn-sm btn-outline-secondary flex-fill" [href]="'tel:' + d.customer.mobileNumber"><i class="bi bi-telephone me-1"></i>Call</a>
        <a class="btn btn-sm btn-outline-success flex-fill" [href]="'https://wa.me/91' + d.customer.mobileNumber" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a>
        <a class="btn btn-sm btn-outline-secondary flex-fill" [href]="'sms:' + d.customer.mobileNumber"><i class="bi bi-chat-text me-1"></i>SMS</a>
      </div></div>

      <div class="row g-2 mb-3 text-center">
        <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">Orders</div><div class="fw-semibold fs-5">{{ d.stats.totalOrders }}</div></div></div></div>
        <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">Spent</div><div class="fw-semibold fs-5">{{ d.stats.totalSpent | inr: 0 }}</div></div></div></div>
        <div class="col-4"><div class="card"><div class="card-body py-2"><div class="small text-muted">Avg.</div><div class="fw-semibold fs-5">{{ d.stats.averageOrderValue | inr: 0 }}</div></div></div></div>
      </div>

      <div class="d-grid mb-3"><button class="btn btn-primary" (click)="newBill()"><i class="bi bi-receipt-cutoff me-1"></i>New bill for this customer</button></div>

      <div class="card">
        <div class="card-header"><span class="card-title">Order history</span></div>
        <div class="m-list">
          @for (o of d.orders; track o._id) {
            <a class="m-item" [routerLink]="['/orders', o._id]">
              <span class="flex-grow-1"><span class="d-block small fw-semibold">{{ o.orderId }}</span><span class="cell-sub">{{ o.createdAt | date: 'd MMM y' }} · {{ o.source === 'POS' ? 'Counter' : 'App' }} · {{ o.paymentMethod }}</span></span>
              <span class="text-end"><span class="d-block fw-semibold small">{{ o.finalAmount | inr }}</span><app-status-badge [status]="o.orderStatus" /></span>
            </a>
          } @empty { <div class="text-center text-muted small py-4">No orders yet</div> }
        </div>
      </div>

      <app-sheet [open]="editOpen()" title="Edit customer" (closed)="editOpen.set(false)">
        <label class="form-label">Name</label><input class="form-control mb-2" [(ngModel)]="edit.name" />
        <label class="form-label">Phone number</label>
        <div class="input-group mb-1"><span class="input-group-text">+91</span><input class="form-control" maxlength="10" inputmode="numeric" [(ngModel)]="edit.mobileNumber" /></div>
        @if (edit.mobileNumber && edit.mobileNumber !== d.customer.mobileNumber) { <div class="form-text text-warning mb-2">The new number gets access to your shop in the user app; the old number loses it.</div> } @else { <div class="mb-2"></div> }
        <label class="form-label">Email</label><input class="form-control mb-2" type="email" [(ngModel)]="edit.email" />
        <label class="form-label">Address</label><textarea class="form-control mb-2" rows="2" [(ngModel)]="edit.address"></textarea>
        <div sheet-footer class="sheet-footer"><button class="btn btn-light" (click)="editOpen.set(false)">Cancel</button><button class="btn btn-primary" (click)="save()">Save</button></div>
      </app-sheet>
    }
  `,
})
export class CustomerDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  d = signal<any>(null);
  error = signal<string | null>(null);
  editOpen = signal(false);
  edit: any = {};

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/customers/${this.id}`).subscribe({ next: (d) => this.d.set(d), error: (e) => this.error.set(errorMessage(e)) });
  }

  openEdit() {
    const c = this.d().customer;
    this.edit = { name: c.name || '', mobileNumber: c.mobileNumber, email: c.email || '', address: c.address || '' };
    this.editOpen.set(true);
  }

  save() {
    const mobile = String(this.edit.mobileNumber || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) return this.toast.warning('Enter a valid 10 digit phone number');
    const body = { ...this.edit, mobileNumber: mobile };
    if (mobile === this.d().customer.mobileNumber) delete body.mobileNumber;
    this.api.put(`/customers/${this.id}`, body).subscribe({ next: () => { this.toast.success('Saved'); this.editOpen.set(false); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  newBill() {
    localStorage.setItem('pn_bill_draft', JSON.stringify({ lines: [], customer: this.d().customer }));
    this.router.navigate(['/billing']);
  }

  async remove() {
    if (!(await this.confirm.confirm('Remove customer?', 'They will no longer see your shop in the user app. Past orders stay.', 'danger', 'Remove'))) return;
    this.api.delete(`/customers/${this.id}`).subscribe({ next: () => { this.toast.success('Customer removed'); this.router.navigate(['/customers']); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
