import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { MOBILE_PATTERN } from '../../shared/validators/password';
import { CanDirective, EntitySelectComponent, InrPipe, ModalComponent, PageHeaderComponent, PaginationComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-user-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StatCardComponent, StateComponent, StatusBadgeComponent, InrPipe, ModalComponent, EntitySelectComponent, PaginationComponent, CanDirective],
  templateUrl: './user-detail.component.html',
})
export class UserDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  data = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  linkOpen = signal(false);
  linkSeller: string | null = null;
  linkType = 'Retail';

  editOpen = signal(false);
  edit = { name: '', email: '', mobileNumber: '' };

  orders = signal<any[]>([]);
  ordersPage = 1;
  ordersPages = signal(1);
  ordersTotal = signal(0);

  ngOnInit() {
    this.load();
    this.loadOrders();
  }

  load() {
    this.api.get<any>(`/users/${this.id}`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  loadOrders() {
    this.api.get<any>(`/users/${this.id}/orders`, { page: this.ordersPage, limit: 10 }).subscribe((r) => {
      this.orders.set(r.items);
      this.ordersPages.set(r.pages);
      this.ordersTotal.set(r.totalCount);
    });
  }

  link() {
    if (!this.linkSeller) return this.toast.warning('Select a seller');
    this.api.post(`/users/${this.id}/link-seller`, { sellerId: this.linkSeller, customerType: this.linkType }).subscribe({
      next: () => { this.toast.success('User linked to seller'); this.linkOpen.set(false); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async unlink(l: any) {
    if (!(await this.confirm.confirm('Remove from seller?', `The user will no longer see products of ${l.seller?.shopName}.`, 'danger', 'Remove'))) return;
    this.api.post(`/users/${this.id}/unlink-seller`, { sellerId: l.seller._id }).subscribe({
      next: () => { this.toast.success('Removed from seller'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  openEdit() {
    const u = this.data().user;
    this.edit = { name: u.name || '', email: u.email || '', mobileNumber: u.mobileNumber };
    this.editOpen.set(true);
  }

  saveEdit() {
    if (!MOBILE_PATTERN.test(this.edit.mobileNumber)) return this.toast.warning('Invalid mobile number');
    this.api.put(`/users/${this.id}`, this.edit).subscribe({
      next: () => { this.toast.success('User updated'); this.editOpen.set(false); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async block() {
    const reason = await this.confirm.prompt('Block user?', 'The user will be logged out and cannot place orders.', 'Reason', 'Block');
    if (reason === null) return;
    this.api.post(`/users/${this.id}/block`, { reason }).subscribe({ next: () => { this.toast.success('User blocked'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  unblock() {
    this.api.post(`/users/${this.id}/unblock`).subscribe({ next: () => { this.toast.success('User unblocked'); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  async remove() {
    if (!(await this.confirm.confirm('Delete user?', 'The user account will be removed and unlinked from all sellers. Orders are kept.', 'danger', 'Delete'))) return;
    this.api.delete(`/users/${this.id}`).subscribe({
      next: () => { this.toast.success('User deleted'); this.router.navigate(['/users']); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
