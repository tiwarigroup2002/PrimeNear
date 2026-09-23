import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { strongPassword } from '../../shared/validators/password';
import { PageHeaderComponent, PasswordStrengthComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, FormsModule, PageHeaderComponent, PasswordStrengthComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="My profile" icon="bi-person-circle" />
    @if (auth.admin(); as me) {
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Profile</span></div>
            <div class="card-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                @if (me.profileImage) { <img [src]="me.profileImage" class="avatar" style="width: 72px; height: 72px" alt="" /> }
                @else { <span class="avatar avatar-initials" style="width: 72px; height: 72px; font-size: 1.5rem">{{ me.fullName.slice(0, 1) }}</span> }
                <div>
                  <div class="fw-semibold">{{ me.email }}</div>
                  <app-status-badge [status]="me.role" />
                  <label class="btn btn-sm btn-link px-0 d-block">Change photo<input type="file" accept="image/*" hidden (change)="uploadPhoto($event)" /></label>
                </div>
              </div>
              <div class="mb-3"><label class="form-label">Full name</label><input class="form-control" [(ngModel)]="profile.fullName" /></div>
              <div class="mb-3"><label class="form-label">Mobile</label><input class="form-control" [(ngModel)]="profile.mobileNumber" maxlength="10" /></div>
              <button class="btn btn-primary" (click)="saveProfile()">Save profile</button>
              @if (me.lastLogin) { <div class="small text-muted mt-3">Last login: {{ me.lastLogin | date: 'd MMM y, h:mm a' }}</div> }
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">My permissions ({{ me.permissions.length }})</span></div>
            <div class="card-body d-flex flex-wrap gap-1">@for (p of me.permissions; track p) { <span class="badge text-bg-light border">{{ p }}</span> }</div>
          </div>
        </div>
        <div class="col-lg-6" id="security">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Change password</span></div>
            <div class="card-body">
              <div class="mb-3"><label class="form-label">Current password</label><input type="password" class="form-control" [(ngModel)]="pw.current" autocomplete="current-password" /></div>
              <div class="mb-3"><label class="form-label">New password</label><input type="password" class="form-control" [(ngModel)]="pw.next" autocomplete="new-password" /><app-password-strength [value]="pw.next" /></div>
              <div class="mb-3"><label class="form-label">Confirm new password</label><input type="password" class="form-control" [(ngModel)]="pw.confirm" autocomplete="new-password" />
                @if (pw.confirm && pw.confirm !== pw.next) { <div class="text-danger small">Passwords do not match</div> }</div>
              <button class="btn btn-primary" (click)="changePassword()" [disabled]="busy()">Change password</button>
              <div class="form-text">Other sessions are logged out after a password change.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="card-title">Two-factor authentication</span>
              @if (me.twoFactorEnabled) { <span class="badge text-bg-success"><i class="bi bi-shield-check"></i> Enabled</span> } @else { <span class="badge text-bg-secondary">Off</span> }
            </div>
            <div class="card-body">
              @if (me.twoFactorEnabled) {
                <p class="small">Your account asks for a code from your authenticator app at every login.</p>
                <div class="input-group" style="max-width: 420px">
                  <input type="password" class="form-control" placeholder="Current password" [(ngModel)]="disablePassword" />
                  <button class="btn btn-outline-danger" (click)="disable2fa()">Disable 2FA</button>
                </div>
              } @else if (setup(); as s) {
                <ol class="small ps-3">
                  <li>Install Google Authenticator / Microsoft Authenticator / Authy.</li>
                  <li>Scan this QR code (or enter the key manually).</li>
                  <li>Enter the 6-digit code shown in the app.</li>
                </ol>
                <div class="text-center mb-3"><img [src]="s.qrCode" alt="2FA QR code" width="180" height="180" class="border rounded" /></div>
                <div class="small text-center mb-3">Key: <code>{{ s.secret }}</code></div>
                <div class="input-group" style="max-width: 320px; margin: 0 auto">
                  <input class="form-control otp-input" maxlength="6" inputmode="numeric" [(ngModel)]="code" placeholder="000000" />
                  <button class="btn btn-success" (click)="enable2fa()">Verify & enable</button>
                </div>
              } @else {
                <p class="small">Protect your account with a one-time code from an authenticator app in addition to your password.</p>
                <button class="btn btn-outline-primary" (click)="start2fa()"><i class="bi bi-qr-code me-1"></i>Set up 2FA</button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  profile = { fullName: '', mobileNumber: '' };
  pw = { current: '', next: '', confirm: '' };
  busy = signal(false);
  setup = signal<{ secret: string; qrCode: string } | null>(null);
  code = '';
  disablePassword = '';

  ngOnInit() {
    const me = this.auth.admin();
    this.profile = { fullName: me?.fullName || '', mobileNumber: me?.mobileNumber || '' };
  }

  saveProfile() {
    if (this.profile.mobileNumber && !/^[6-9]\d{9}$/.test(this.profile.mobileNumber)) return this.toast.warning('Invalid mobile number');
    this.api.put<any>('/auth/profile', this.profile).subscribe({
      next: (r) => { this.auth.setAdmin(r.data); this.toast.success('Profile updated'); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  uploadPhoto(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('image', f);
    this.http.post<any>(`${this.api.base}/auth/profile/image`, fd).subscribe({
      next: () => { this.auth.refreshMe().subscribe(); this.toast.success('Photo updated'); },
      error: (err) => this.toast.error(errorMessage(err)),
    });
  }

  changePassword() {
    if (!this.pw.current) return this.toast.warning('Enter your current password');
    if (strongPassword(new FormControl(this.pw.next))) return this.toast.warning('New password is too weak');
    if (this.pw.next !== this.pw.confirm) return this.toast.warning('Passwords do not match');
    this.busy.set(true);
    this.api.put<any>('/auth/change-password', { currentPassword: this.pw.current, newPassword: this.pw.next }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.auth.setToken(r.data.token);
        this.pw = { current: '', next: '', confirm: '' };
        this.toast.success('Password changed');
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  start2fa() {
    this.api.post<any>('/auth/2fa/setup').subscribe({ next: (r) => this.setup.set(r.data), error: (e) => this.toast.error(errorMessage(e)) });
  }

  enable2fa() {
    this.api.post<any>('/auth/2fa/enable', { code: this.code.trim() }).subscribe({
      next: (r) => { this.auth.setAdmin(r.data); this.setup.set(null); this.code = ''; this.toast.success('Two-factor authentication enabled'); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  disable2fa() {
    this.api.post<any>('/auth/2fa/disable', { password: this.disablePassword }).subscribe({
      next: (r) => { this.auth.setAdmin(r.data); this.disablePassword = ''; this.toast.success('Two-factor authentication disabled'); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
