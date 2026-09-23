import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { matchValidator, strongPassword } from '../../shared/validators/password';
import { PasswordStrengthComponent } from '../../shared';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, PasswordStrengthComponent],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4 p-md-5">
          <h1 class="h4 fw-bold">Set a new password</h1>
          @if (!token) {
            <div class="alert alert-danger small">The reset link is invalid.</div>
          } @else {
            @if (error()) { <div class="alert alert-danger small py-2">{{ error() }}</div> }
            <form [formGroup]="form" (ngSubmit)="submit()">
              <label class="form-label" for="np">New password</label>
              <input id="np" type="password" class="form-control" formControlName="newPassword" autocomplete="new-password" />
              <app-password-strength [value]="form.controls.newPassword.value" />
              <label class="form-label mt-3" for="cp">Confirm password</label>
              <input id="cp" type="password" class="form-control" formControlName="confirm" autocomplete="new-password" />
              @if (form.touched && form.hasError('mismatch')) { <div class="text-danger small mt-1">Passwords do not match</div> }
              <button class="btn btn-primary w-100 mt-4" [disabled]="loading() || form.invalid">Reset password</button>
            </form>
          }
          <a routerLink="/auth/login" class="d-block small mt-3 text-decoration-none"><i class="bi bi-arrow-left"></i> Back to login</a>
        </div>
      </div>
    </div>
  `,
})
export class ResetPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
  loading = signal(false);
  error = signal<string | null>(null);
  form = inject(FormBuilder).nonNullable.group(
    { newPassword: ['', [Validators.required, strongPassword]], confirm: ['', Validators.required] },
    { validators: matchValidator('newPassword', 'confirm') }
  );

  submit() {
    if (this.form.invalid || !this.token) return;
    this.loading.set(true);
    this.auth.resetPassword(this.token, this.form.getRawValue().newPassword).subscribe({
      next: (r) => {
        this.toast.success(r.message || 'Password reset');
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
