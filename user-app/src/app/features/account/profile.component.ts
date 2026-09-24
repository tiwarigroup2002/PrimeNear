import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent } from '../../shared';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="Edit profile" back="/account" backLabel="Account" />
    <div class="card" style="max-width:560px"><div class="card-body">
      <div class="text-center mb-3">
        <label class="position-relative d-inline-block" style="cursor:pointer" aria-label="Change photo">
          @if (auth.user()?.profileImage) { <img [src]="auth.user()!.profileImage" class="avatar" style="width:88px;height:88px" alt="" /> } @else { <span class="avatar avatar-initials" style="width:88px;height:88px">{{ initials() }}</span> }
          <span class="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width:30px;height:30px">@if (uploading()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-camera"></i> }</span>
          <input type="file" accept="image/*" hidden (change)="upload($event)" />
        </label>
      </div>
      <form (ngSubmit)="save()">
        <label class="form-label">Mobile number</label>
        <input class="form-control mb-3" [value]="'+91 ' + auth.user()?.mobileNumber" disabled />
        <label class="form-label required" for="nm">Full name</label>
        <input id="nm" class="form-control mb-3" name="name" [(ngModel)]="m.name" maxlength="80" required />
        <label class="form-label" for="em">Email (for invoices)</label>
        <input id="em" class="form-control mb-3" type="email" name="email" [(ngModel)]="m.email" />
        <div class="row g-2 mb-3">
          <div class="col-6"><label class="form-label" for="dob">Date of birth</label><input id="dob" class="form-control" type="date" name="dob" [(ngModel)]="m.dateOfBirth" [max]="today" /></div>
          <div class="col-6"><label class="form-label" for="gd">Gender</label><select id="gd" class="form-select" name="gender" [(ngModel)]="m.gender"><option value="">–</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        </div>
        <button class="btn btn-primary w-100" [disabled]="busy()">@if (busy()) { <span class="spinner-border spinner-border-sm me-2"></span> }Save changes</button>
      </form>
    </div></div>
  `,
})
export class ProfileComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);
  today = new Date().toISOString().slice(0, 10);
  m = { name: this.auth.user()?.name || '', email: this.auth.user()?.email || '', dateOfBirth: this.auth.user()?.dateOfBirth?.slice(0, 10) || '', gender: this.auth.user()?.gender || '' };
  busy = signal(false);
  uploading = signal(false);
  initials = computed(() => (this.auth.user()?.name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase());

  save() {
    if ((this.m.name || '').trim().length < 2) return this.toast.warning('Enter your name');
    const body: any = { name: this.m.name.trim(), email: this.m.email || '', dateOfBirth: this.m.dateOfBirth || null };
    if (this.m.gender) body.gender = this.m.gender;
    this.busy.set(true);
    this.api.put<any>('/profile', body).subscribe({
      next: (r) => { this.busy.set(false); this.auth.setUser(r.data); this.toast.success(r.message || 'Saved'); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  upload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    this.uploading.set(true);
    this.api.post<any>('/profile/upload-image', fd).subscribe({
      next: (r) => { this.uploading.set(false); this.auth.setUser({ ...this.auth.user()!, profileImage: r.data.profileImage }); this.toast.success('Photo updated'); },
      error: (err) => { this.uploading.set(false); this.toast.error(errorMessage(err)); },
    });
  }
}
