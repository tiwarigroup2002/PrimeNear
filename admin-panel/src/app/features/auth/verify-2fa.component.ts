import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

@Component({
  selector: 'app-verify-2fa',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4 p-md-5 text-center">
          <i class="bi bi-shield-lock fs-1 text-primary"></i>
          <h1 class="h4 fw-bold mt-2">Two-factor authentication</h1>
          <p class="text-muted small">Enter the 6-digit code from your authenticator app.</p>
          @if (error()) { <div class="alert alert-danger small py-2">{{ error() }}</div> }
          <form (ngSubmit)="submit()">
            <input class="form-control otp-input mb-3" name="code" [(ngModel)]="code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" autofocus placeholder="••••••" />
            <button class="btn btn-primary w-100" [disabled]="loading() || code.length !== 6">
              @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }Verify
            </button>
          </form>
          <a routerLink="/auth/login" class="d-block small mt-3 text-decoration-none"><i class="bi bi-arrow-left"></i> Back to login</a>
        </div>
      </div>
    </div>
  `,
})
export class Verify2faComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  code = '';
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    if (!this.auth.tempToken) this.router.navigate(['/auth/login']);
  }

  submit() {
    this.code = this.code.replace(/\D/g, '');
    if (this.code.length !== 6) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.verify2fa(this.code).subscribe({
      next: (res) => {
        this.toast.success(`Welcome back, ${res.admin?.fullName}`);
        if (res.passwordExpired) {
          this.toast.warning('Your password has expired. Please change it.');
          this.router.navigate(['/profile'], { fragment: 'security' });
        } else {
          this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err, 'Invalid code'));
        if (err.status === 401 && /expired|Invalid token/i.test(err.error?.message || '')) this.router.navigate(['/auth/login']);
      },
    });
  }
}
