import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Customer } from '../../core/models/api.models';
import { MOBILE_PATTERN } from '../../shared/validators/patterns';
import { InrPipe, PageHeaderComponent, PaginationComponent, SheetComponent, StateComponent, TimeAgoPipe } from '../../shared';

@Component({
  selector: 'app-customer-list',
  imports: [FormsModule, RouterLink, InrPipe, TimeAgoPipe, PageHeaderComponent, PaginationComponent, StateComponent, SheetComponent],
  template: `
    <app-page-header title="Customers" [subtitle]="usageText()">
      <a routerLink="/customers/bulk-upload" class="btn btn-sm btn-outline-secondary" [class.disabled]="isFull()"><i class="bi bi-upload"></i><span class="d-none d-md-inline ms-1">CSV</span></a>
      <button class="btn btn-sm btn-primary" (click)="openAdd()" [disabled]="isFull()"><i class="bi bi-person-plus me-1"></i>Add</button>
    </app-page-header>
    @if (limit() !== null) {
      <div class="card mb-3"><div class="card-body py-2">
        <div class="d-flex justify-content-between small mb-1"><span class="fw-semibold">Customer limit</span><span>{{ used() }} / {{ limit() }}</span></div>
        <div class="progress" style="height: 6px"><div class="progress-bar" [class.bg-danger]="isFull()" [style.width.%]="limit() ? (used() / limit()!) * 100 : 0"></div></div>
        @if (isFull()) { <div class="small text-danger mt-1"><i class="bi bi-exclamation-circle me-1"></i>Limit reached. Ask the admin to allow more customers.</div> }
        @else { <div class="small text-muted mt-1">You can add {{ limit()! - used() }} more customer(s).</div> }
      </div></div>
    }
    <div class="alert alert-info small py-2"><i class="bi bi-info-circle me-1"></i>Only customers you add here can see your shop in the user app.</div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <div class="input-group" style="max-width: 420px">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input class="form-control" placeholder="Name or mobile" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" />
      </div>
      <select class="form-select w-auto" [(ngModel)]="list.filters['sortBy']" (change)="list.apply()"><option value="">Newest</option><option value="spent">Top spenders</option><option value="recent">Recent buyers</option><option value="name">Name</option></select>
    </div>
    <div class="card">
      <div class="m-list">
        @for (c of list.items(); track c._id) {
          <a class="m-item" [routerLink]="['/customers', c._id]">
            <span class="shop-avatar shop-avatar-initial" style="border-radius: 50%">{{ (c.name || '?').slice(0, 1).toUpperCase() }}</span>
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold small text-truncate">{{ c.name || 'Customer' }}</span>
              <span class="cell-sub d-block">{{ c.mobileNumber }}</span>
              <span class="cell-sub">{{ c.totalOrders }} bills · last {{ c.lastPurchaseDate ? (c.lastPurchaseDate | timeAgo) : 'never' }}</span>
            </span>
            <span class="fw-semibold small">{{ c.totalSpent | inr: 0 }}</span>
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No customers yet" icon="bi-people" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-sheet [open]="addOpen()" title="Add customer" (closed)="addOpen.set(false)">
      <label class="form-label required">Mobile number</label>
      <div class="input-group mb-3"><span class="input-group-text">+91</span><input class="form-control" maxlength="10" inputmode="numeric" [(ngModel)]="form.mobileNumber" /></div>
      <label class="form-label">Name</label>
      <input class="form-control mb-3" [(ngModel)]="form.name" />
      <label class="form-label">Email</label>
      <input class="form-control mb-3" type="email" [(ngModel)]="form.email" />
      <label class="form-label mt-3">Address</label>
      <textarea class="form-control" rows="2" [(ngModel)]="form.address"></textarea>
      <div sheet-footer class="sheet-footer"><button class="btn btn-light" (click)="addOpen.set(false)">Cancel</button><button class="btn btn-primary" (click)="save()" [disabled]="saving()">Add customer</button></div>
    </app-sheet>
  `,
})
export class CustomerListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  list = new PagedList<Customer>('/customers', { search: '', sortBy: '' });
  addOpen = signal(!!inject(ActivatedRoute).snapshot.queryParamMap.get('add'));
  saving = signal(false);
  form = { mobileNumber: '', name: '', email: '', address: '' };

  // Customer limit set by the admin (null = no limit)
  used = computed(() => this.list.extra()['customerCount'] ?? this.list.total());
  limit = computed<number | null>(() => this.list.extra()['customerLimit'] ?? null);
  isFull = computed(() => this.limit() !== null && this.used() >= this.limit()!);
  usageText = computed(() => (this.limit() !== null ? `${this.used()} of ${this.limit()} customers` : `${this.list.total()} customers`));

  ngOnInit() {
    this.list.load();
  }

  openAdd() {
    this.form = { mobileNumber: '', name: '', email: '', address: '' };
    this.addOpen.set(true);
  }

  save() {
    const m = this.form.mobileNumber.replace(/\D/g, '').slice(-10);
    if (!MOBILE_PATTERN.test(m)) return this.toast.warning('Enter a valid 10 digit mobile number');
    this.saving.set(true);
    this.api.post<any>('/customers', { ...this.form, mobileNumber: m }).subscribe({
      next: (r) => { this.saving.set(false); this.addOpen.set(false); this.toast.success(r.message || 'Customer added'); this.router.navigate(['/customers', r.data._id]); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
