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
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4">
          <div class="text-center mb-4">
            <span class="brand-mark text-white fs-3 mb-2" style="width:56px;height:56px"><i class="bi bi-bag-heart-fill"></i></span>
            <h1 class="h4 fw-bold mb-1">{{ cfg.config().platformName }}</h1>
            <p class="text-muted small mb-0">अपनी भरोसेमंद दुकान से ऑनलाइन खरीदें · Shop from your trusted local stores</p>
          </div>
          @if (notice()) { <div class="alert alert-warning small py-2">{{ notice() }}</div> }
          @if (error()) { <div class="alert small py-2" [class.alert-danger]="!notLinked()" [class.alert-warning]="notLinked()">@if (notLinked()) { <i class="bi bi-shop me-1"></i> }{{ error() }}</div> }

          @if (step() === 'mobile') {
            <form (ngSubmit)="send()">
              <label class="form-label" for="mobile">Mobile number / मोबाइल नंबर</label>
              <div class="input-group input-group-lg mb-3">
                <span class="input-group-text">+91</span>
                <input id="mobile" name="mobile" class="form-control" [(ngModel)]="mobile" maxlength="10" inputmode="numeric" autocomplete="tel-national" placeholder="98765 43210" autofocus />
              </div>
              <button class="btn btn-primary btn-lg w-100" [disabled]="busy()">
                @if (busy()) { <span class="spinner-border spinner-border-sm me-2"></span> }Get OTP
              </button>
              <p class="small text-muted mt-3 mb-0 text-center">Your number must be added by a shop you buy from. दुकानदार से अपना नंबर जुड़वाएं।</p>
            </form>
          } @else {
            <form (ngSubmit)="verify()">
              <p class="text-center small mb-3">OTP sent to <strong>+91 {{ mobile }}</strong> <a href="" (click)="$event.preventDefault(); back()">Change</a></p>
              <div class="otp-boxes mb-3" (paste)="paste($event)">
                @for (i of [0, 1, 2, 3, 4, 5]; track i) {
                  <input #box class="form-control" inputmode="numeric" maxlength="1" [value]="digits[i]" (input)="type(i, $event)" (keydown.backspace)="backspace(i, $event)" autocomplete="one-time-code" [attr.aria-label]="'Digit ' + (i + 1)" />
                }
              </div>
              @if (devOtp()) { <div class="alert alert-info small py-1 text-center">Test mode OTP: <strong>{{ devOtp() }}</strong></div> }
              <button class="btn btn-primary btn-lg w-100" [disabled]="busy() || code().length !== 6">
                @if (busy()) { <span class="spinner-border spinner-border-sm me-2"></span> }Verify & login
              </button>
              <div class="text-center small mt-3">
                @if (wait() > 0) { Resend OTP in {{ wait() }}s } @else { <a href="" (click)="$event.preventDefault(); send()">Resend OTP</a> }
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
  mobile = '';
  digits: string[] = ['', '', '', '', '', ''];
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
      next: (r) => {
        this.busy.set(false);
        this.step.set('otp');
        this.devOtp.set(r.data.devOtp ?? null);
        this.digits = ['', '', '', '', '', ''];
        this.code.set('');
        this.startTimer(r.data.resendIn || 30);
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
    if (v && i < 5) this.boxes.get(i + 1)?.nativeElement.focus();
    if (this.code().length === 6) this.verify();
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
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    this.digits = text.padEnd(6, ' ').split('').map((d) => d.trim());
    this.boxes.forEach((b, idx) => (b.nativeElement.value = this.digits[idx]));
    this.code.set(this.digits.join(''));
    if (text.length === 6) this.verify();
  }

  verify() {
    if (this.code().length !== 6 || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.verifyOtp(this.mobile, this.code()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(r.user.name ? `Welcome, ${r.user.name}` : 'Welcome!');
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
