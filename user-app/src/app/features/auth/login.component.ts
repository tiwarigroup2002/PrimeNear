import { Component, ElementRef, OnDestroy, QueryList, ViewChildren, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { MOBILE_PATTERN } from '../../shared/validators/patterns';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-lg border-0">
        <div class="card-body">
          <div class="text-center mb-4">
            <div class="position-relative d-inline-block mb-3">
              <img src="logo.png" alt="PrimeNear" class="rounded-4 shadow" width="76" height="76" style="border: 2px solid rgba(255,255,255,0.9);" />
              <span class="position-absolute bottom-0 end-0 translate-middle p-1 bg-success border border-light rounded-circle" title="WhatsApp Verified">
                <span class="visually-hidden">Verified</span>
              </span>
            </div>
            <h1 class="h4 fw-bolder mb-1 text-dark" style="letter-spacing: -0.02em;">{{ cfg.config().platformName }}</h1>
            <p class="text-muted small mb-0 fw-medium">Hyperlocal Marketplace • Direct Local Store Delivery</p>
          </div>

          @if (notice()) {
            <div class="alert alert-warning small py-2 d-flex align-items-center gap-2 rounded-3 border-0 shadow-xs mb-3">
              <i class="bi bi-info-circle-fill fs-6 text-warning"></i>
              <span>{{ notice() }}</span>
            </div>
          }
          @if (error()) {
            <div class="alert small py-2 d-flex align-items-center gap-2 rounded-3 border-0 shadow-xs mb-3" [class.alert-danger]="!notLinked()" [class.alert-warning]="notLinked()">
              <i class="bi" [class.bi-exclamation-triangle-fill]="!notLinked()" [class.bi-shop]="notLinked()"></i>
              <span>{{ error() }}</span>
            </div>
          }

          @if (step() === 'mobile') {
            <form (ngSubmit)="send()">
              <label class="form-label" for="mobile">Mobile Number</label>
              <div class="input-group input-group-lg mb-3 shadow-xs">
                <span class="input-group-text bg-light border-end-0 fw-bold text-dark px-3" style="font-size: 0.95rem;">
                  🇮🇳 +91
                </span>
                <input
                  id="mobile"
                  name="mobile"
                  class="form-control border-start-0 ps-1 fw-semibold text-dark"
                  [(ngModel)]="mobile"
                  maxlength="10"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  placeholder="Enter 10-digit number"
                  autofocus
                />
              </div>
              <button class="btn btn-primary btn-lg w-100 py-3 shadow-sm rounded-3 fw-bold" [disabled]="busy() || mobile.length < 10">
                @if (busy()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>Sending...
                } @else {
                  <i class="bi bi-whatsapp me-2 fs-5"></i>Get WhatsApp OTP
                }
              </button>
              <div class="d-flex align-items-center justify-content-center gap-2 mt-3 pt-1 text-muted small text-center">
                <i class="bi bi-shield-check text-success fs-5"></i>
                <span style="font-size: 0.78rem;">Instant 4-digit verification code sent via WhatsApp</span>
              </div>
            </form>
          } @else {
            <form (ngSubmit)="verify()">
              <div class="p-3 mb-3 rounded-4 bg-light text-center border">
                <div class="d-inline-flex align-items-center gap-2 mb-1">
                  <i class="bi bi-whatsapp text-success fs-5"></i>
                  <span class="small fw-semibold text-dark">Verification Code Sent</span>
                </div>
                <div class="small text-muted">
                  Sent to <strong>+91 {{ mobile }}</strong> · <a href="" (click)="$event.preventDefault(); back()" class="text-decoration-none fw-semibold text-primary">Edit number</a>
                </div>
              </div>

              <div class="otp-boxes mb-3" (paste)="paste($event)">
                @for (i of boxIndices(); track i) {
                  <input
                    #box
                    class="form-control"
                    inputmode="numeric"
                    maxlength="1"
                    [value]="digits[i]"
                    (input)="type(i, $event)"
                    (keydown.backspace)="backspace(i, $event)"
                    autocomplete="one-time-code"
                    [attr.aria-label]="'Digit ' + (i + 1)"
                  />
                }
              </div>

              @if (devOtp()) {
                <div class="alert alert-info small py-1 text-center rounded-3 mb-3 border-0">
                  Verification Code: <strong>{{ devOtp() }}</strong>
                </div>
              }

              <button class="btn btn-primary btn-lg w-100 py-3 shadow-sm rounded-3 fw-bold mb-3" [disabled]="busy() || code().length !== expectedLength()">
                @if (busy()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>Verifying...
                } @else {
                  Verify & Continue <i class="bi bi-arrow-right ms-1"></i>
                }
              </button>

              <div class="text-center small">
                @if (wait() > 0) {
                  <span class="text-muted d-inline-flex align-items-center gap-1">
                    <i class="bi bi-clock-history"></i> Resend code in <strong>{{ wait() }}s</strong>
                  </span>
                } @else {
                  <a href="" (click)="$event.preventDefault(); send()" class="text-primary text-decoration-none fw-semibold">
                    <i class="bi bi-arrow-clockwise me-1"></i>Resend OTP via WhatsApp
                  </a>
                }
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnDestroy {
  @ViewChildren('box') boxes!: QueryList<ElementRef<HTMLInputElement>>;
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  cfg = inject(AppConfigService);

  step = signal<'mobile' | 'otp'>('mobile');
  expectedLength = signal<number>(4);
  boxIndices = signal<number[]>([0, 1, 2, 3]);
  mobile = '';
  digits: string[] = ['', '', '', ''];
  code = signal('');
  busy = signal(false);
  error = signal<string | null>(null);
  devOtp = signal<string | null>(null);
  wait = signal(0);
  notice = signal<string | null>(null);
  notLinked = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  send() {
    this.mobile = this.mobile.replace(/\D/g, '').slice(-10);
    if (!MOBILE_PATTERN.test(this.mobile)) return this.error.set('Enter a valid 10 digit mobile number');
    this.busy.set(true);
    this.error.set(null);
    this.auth.sendOtp(this.mobile).subscribe({
      next: (r: any) => {
        this.busy.set(false);
        this.step.set('otp');
        this.devOtp.set(r.data?.devOtp ?? null);
        const len = 4;
        this.expectedLength.set(len);
        this.boxIndices.set([0, 1, 2, 3]);
        this.digits = Array(len).fill('');
        this.code.set('');
        const resendSec = r.data?.resendIn || r.resendIn || 60;
        this.startTimer(resendSec);
        setTimeout(() => this.boxes?.first?.nativeElement.focus(), 50);
      },
      error: (e) => {
        this.busy.set(false);
        this.notLinked.set(e.status === 404);
        this.error.set(errorMessage(e));
      },
    });
  }

  private startTimer(sec: number) {
    clearInterval(this.timer);
    this.wait.set(sec);
    this.timer = setInterval(() => {
      this.wait.update((w) => w - 1);
      if (this.wait() <= 0) clearInterval(this.timer);
    }, 1000);
  }

  back() {
    this.step.set('mobile');
    this.error.set(null);
  }

  type(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const v = el.value.replace(/\D/g, '');
    this.digits[i] = v.slice(-1);
    el.value = this.digits[i];
    this.code.set(this.digits.join(''));
    if (v && i < this.expectedLength() - 1) this.boxes.get(i + 1)?.nativeElement.focus();
    if (this.code().length === this.expectedLength()) this.verify();
  }

  backspace(i: number, e: Event) {
    if (!this.digits[i] && i > 0) {
      e.preventDefault();
      this.digits[i - 1] = '';
      this.code.set(this.digits.join(''));
      this.boxes.get(i - 1)?.nativeElement.focus();
    }
  }

  paste(e: ClipboardEvent) {
    const len = this.expectedLength();
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, len);
    if (!text) return;
    e.preventDefault();
    this.digits = text.padEnd(len, ' ').split('').map((d) => d.trim());
    this.boxes.forEach((b, idx) => {
      if (b && this.digits[idx] !== undefined) b.nativeElement.value = this.digits[idx];
    });
    this.code.set(this.digits.join(''));
    if (this.code().length === len) this.verify();
  }

  verify() {
    if (this.code().length !== this.expectedLength() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.verifyOtp(this.mobile, this.code()).subscribe({
      next: (r: any) => {
        this.busy.set(false);
        const name = r.user?.name || r.name;
        this.toast.success(name ? `Welcome back, ${name}!` : 'Welcome to PrimeNear!');
        this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/home');
      },
      error: (e) => {
        this.busy.set(false);
        this.notLinked.set(e.status === 404);
        this.error.set(errorMessage(e));
      },
    });
  }
}
