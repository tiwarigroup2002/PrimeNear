import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Tahsil } from '../../core/models/api.models';
import { MOBILE_PATTERN } from '../../shared/validators/password';
import { CanDirective, EntitySelectComponent, InrPipe, ModalComponent, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-user-list',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, EntitySelectComponent, CanDirective],
  templateUrl: './user-list.component.html',
})
export class UserListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  list = new PagedList<any>('/users', { search: '', status: '', tahsilId: '', sellerId: '', linked: '' });
  tahsils = signal<Tahsil[]>([]);

  // Add & link modal
  addOpen = signal(false);
  saving = signal(false);
  form = { mobileNumber: '', name: '', email: '', sellerId: '', customerType: 'Retail' };
  formError = signal<string | null>(null);

  constructor(lookup: LookupService) {
    lookup.tahsils().subscribe((t) => this.tahsils.set(t));
  }

  ngOnInit() {
    this.list.load();
  }

  filterSeller(s: any) {
    this.list.filters['sellerId'] = s?._id ?? '';
    this.list.apply();
  }

  openAdd() {
    this.form = { mobileNumber: '', name: '', email: '', sellerId: '', customerType: 'Retail' };
    this.formError.set(null);
    this.addOpen.set(true);
  }

  save() {
    const mobile = this.form.mobileNumber.replace(/\D/g, '').slice(-10);
    if (!MOBILE_PATTERN.test(mobile)) return this.formError.set('Enter a valid 10 digit mobile number');
    if (!this.form.sellerId) return this.formError.set('Select a seller');
    this.saving.set(true);
    this.api.post<any>('/users', { ...this.form, mobileNumber: mobile }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.addOpen.set(false);
        this.toast.success(r.message || 'User linked');
        this.list.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(errorMessage(e));
      },
    });
  }

  async block(u: any) {
    const reason = await this.confirm.prompt(`Block ${u.name || u.mobileNumber}?`, 'The user will be logged out and cannot place orders.', 'Reason', 'Block user');
    if (reason === null) return;
    this.api.post(`/users/${u._id}/block`, { reason }).subscribe({ next: () => { this.toast.success('User blocked'); this.list.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  unblock(u: any) {
    this.api.post(`/users/${u._id}/unblock`).subscribe({ next: () => { this.toast.success('User unblocked'); this.list.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
