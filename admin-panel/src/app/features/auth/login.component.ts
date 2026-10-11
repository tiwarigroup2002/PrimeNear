import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PlatformService } from '../../core/services/platform.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4 p-md-5">
          <div class="text-center mb-4">
            <img src="logo.png" alt="PrimeNear" class="mb-2 rounded-4 shadow-sm" width="64" height="64" />
            <h1 class="h4 fw-bold mb-1">{{ platform.config().platformName }} Admin</h1>
            <p class="text-muted small mb-0">Sign in to manage the platform</p>
          </div>
          @if (notice()) { <div class="alert alert-warning small py-2">{{ notice() }}</div> }
          @if (error()) { <div class="alert alert-danger small py-2"><i class="bi bi-exclamation-circle me-1"></i>{{ error() }}</div> }
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="mb-3">
              <label class="form-label" for="email">Email address</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-envelope"></i></span>
                <input id="email" type="email" class="form-control" formControlName="email" autocomplete="username" placeholder="admin@example.com"
                  [class.is-invalid]="form.controls.email.touched && form.controls.email.invalid" />
              </div>
              @if (form.controls.email.touched && form.controls.email.invalid) { <div class="text-danger small mt-1">Enter a valid email address</div> }
            </div>
            <div class="mb-3">
              <div class="d-flex justify-content-between">
                <label class="form-label" for="password">Password</label>
                <a routerLink="/auth/forgot-password" class="small text-decoration-none">Forgot password?</a>
              </div>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-lock"></i></span>
                <input id="password" [type]="show() ? 'text' : 'password'" class="form-control" formControlName="password" autocomplete="current-password"
                  [class.is-invalid]="form.controls.password.touched && form.controls.password.invalid" />
                <button type="button" class="btn btn-outline-secondary" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Hide password' : 'Show password'">
                  <i class="bi" [class.bi-eye]="!show()" [class.bi-eye-slash]="show()"></i>
                </button>
              </div>
            </div>
            <div class="form-check mb-4">
              <input class="form-check-input" type="checkbox" id="remember" formControlName="remember" />
              <label class="form-check-label small" for="remember">Remember me on this device</label>
            </div>
            <button class="btn btn-primary w-100 py-2" [disabled]="loading()">
              @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  platform = inject(PlatformService);

  show = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [true],
  });

  ngOnInit() {
    this.platform.load();
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'idle') this.notice.set('You were logged out due to inactivity.');
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password, remember } = this.form.getRawValue();
    this.auth.login(email, password, remember).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.requires2fa) {
          this.router.navigate(['/auth/verify-2fa'], { queryParamsHandling: 'preserve' });
          return;
        }
        this.afterLogin(res.mustSetup2fa, res.passwordExpired);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err, 'Login failed'));
      },
    });
  }

  private afterLogin(mustSetup2fa?: boolean, passwordExpired?: boolean) {
    this.toast.success(`Welcome back, ${this.auth.admin()?.fullName}`);
    if (mustSetup2fa || passwordExpired) {
      this.toast.warning(mustSetup2fa ? 'Two-factor authentication is mandatory. Please set it up.' : 'Your password has expired. Please change it.');
      this.router.navigate(['/profile'], { fragment: 'security' });
      return;
    }
    this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard');
  }
}
