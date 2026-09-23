import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { strongPassword, passwordStrength } from '../../shared/validators/password';
import { ModalComponent, PageHeaderComponent, PaginationComponent, PasswordStrengthComponent, StateComponent, StatusBadgeComponent, TimeAgoPipe } from '../../shared';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-admins',
  imports: [DatePipe, FormsModule, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, ModalComponent, PasswordStrengthComponent, TimeAgoPipe],
  templateUrl: './admins.component.html',
})
export class AdminsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  auth = inject(AuthService);

  list = new PagedList<any>('/admins', { search: '', role: '', status: '' });
  catalogue = signal<{ permissions: Record<string, string>; rolePermissions: Record<string, string[]> } | null>(null);
  roles = ['SuperAdmin', 'Admin', 'SupportAdmin'];

  formOpen = signal(false);
  saving = signal(false);
  form: any = { email: '', password: '', fullName: '', mobileNumber: '', role: 'Admin', permissions: [], isActive: true };
  showPassword = false;

  resetOpen = signal(false);
  resetTarget: any = null;
  resetPassword = '';

  permissionGroups = computed(() => {
    const perms = this.catalogue()?.permissions ?? {};
    const groups: Record<string, [string, string][]> = {};
    Object.entries(perms).forEach(([key, label]) => {
      const g = key.split('.')[0];
      (groups[g] ||= []).push([key, label]);
    });
    return Object.entries(groups);
  });

  ngOnInit() {
    this.list.load();
    this.api.get<any>('/admins/permissions').subscribe((c) => this.catalogue.set(c));
  }

  roleHas(role: string, perm: string) {
    return role === 'SuperAdmin' || (this.catalogue()?.rolePermissions[role] ?? []).includes(perm);
  }

  openForm(a?: any) {
    this.form = a
      ? { _id: a._id, email: a.email, fullName: a.fullName, mobileNumber: a.mobileNumber || '', role: a.role, permissions: [...(a.permissions || [])], isActive: a.isActive }
      : { email: '', password: '', fullName: '', mobileNumber: '', role: 'Admin', permissions: [], isActive: true };
    this.formOpen.set(true);
  }

  togglePerm(p: string, on: boolean) {
    const set = new Set<string>(this.form.permissions);
    on ? set.add(p) : set.delete(p);
    this.form.permissions = [...set];
  }

  save() {
    const f = this.form;
    if (!f.fullName?.trim() || !f.email?.trim()) return this.toast.warning('Name and email are required');
    if (!f._id && strongPassword(new FormControl(f.password))) return this.toast.warning('Password must have 8+ chars with upper, lower, number and symbol');
    if (f.mobileNumber && !/^[6-9]\d{9}$/.test(f.mobileNumber)) return this.toast.warning('Invalid mobile number');
    // Only store extras that the role does not already include
    const permissions = f.role === 'SuperAdmin' ? [] : f.permissions.filter((p: string) => !this.roleHas(f.role, p));
    this.saving.set(true);
    const req = f._id
      ? this.api.put(`/admins/${f._id}`, { fullName: f.fullName, mobileNumber: f.mobileNumber, role: f.role, permissions, isActive: f.isActive })
      : this.api.post('/admins', { email: f.email, password: f.password, fullName: f.fullName, mobileNumber: f.mobileNumber, role: f.role, permissions, isActive: f.isActive });
    req.subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.toast.success(f._id ? 'Admin updated' : 'Admin created'); this.list.load(); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async toggleActive(a: any) {
    const on = !a.isActive;
    if (!on && !(await this.confirm.confirm(`Deactivate ${a.fullName}?`, 'They will be logged out immediately.', 'warning', 'Deactivate'))) return;
    this.api.post(`/admins/${a._id}/toggle-active`, { isActive: on }).subscribe({ next: () => { this.toast.success(on ? 'Activated' : 'Deactivated'); this.list.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  openReset(a: any) {
    this.resetTarget = a;
    this.resetPassword = '';
    this.resetOpen.set(true);
  }

  doReset() {
    if (passwordStrength(this.resetPassword).score < 4 || strongPassword(new FormControl(this.resetPassword))) return this.toast.warning('Use a strong password');
    this.api.post(`/admins/${this.resetTarget._id}/reset-password`, { newPassword: this.resetPassword }).subscribe({
      next: () => { this.resetOpen.set(false); this.toast.success('Password reset. Share it securely with the admin.'); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async remove(a: any) {
    if (!(await this.confirm.confirm(`Delete ${a.fullName}?`, 'The admin account will be removed. Their audit history is kept.'))) return;
    this.api.delete(`/admins/${a._id}`).subscribe({ next: () => { this.toast.success('Admin deleted'); this.list.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    const arr = new Uint32Array(10);
    crypto.getRandomValues(arr);
    arr.forEach((n) => (p += chars[n % chars.length]));
    return p + '@' + (arr[0] % 90 + 10);
  }
}
