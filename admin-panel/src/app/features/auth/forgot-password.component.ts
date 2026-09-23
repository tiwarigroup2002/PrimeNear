import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4 p-md-5">
          <h1 class="h4 fw-bold">Forgot password</h1>
          @if (sent()) {
            <div class="alert alert-success small mt-3">{{ sent() }}</div>
          } @else {
            <p class="text-muted small">Enter your admin email. We will send a link to reset your password.</p>
            @if (error()) { <div class="alert alert-danger small py-2">{{ error() }}</div> }
            <form (ngSubmit)="submit()" #f="ngForm">
              <label class="form-label" for="email">Email address</label>
              <input id="email" type="email" name="email" class="form-control mb-3" [(ngModel)]="email" required email #e="ngModel" />
              <button class="btn btn-primary w-100" [disabled]="loading() || e.invalid">
                @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }Send reset link
              </button>
            </form>
          }
          <a routerLink="/auth/login" class="d-block small mt-3 text-decoration-none"><i class="bi bi-arrow-left"></i> Back to login</a>
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  email = '';
  loading = signal(false);
  sent = signal<string | null>(null);
  error = signal<string | null>(null);

  submit() {
    this.loading.set(true);
    this.auth.forgotPassword(this.email).subscribe({
      next: (r) => this.sent.set(r.message || 'Check your email'),
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
