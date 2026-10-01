import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

@Component({
  selector: 'app-select-shop',
  imports: [StatusBadgeComponent],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card shadow-sm">
        <div class="card-body p-4">
          <h1 class="h5 fw-bold text-center">Select your shop</h1>
          <p class="text-muted small text-center">Choose your shop</p>
          <div class="list-group">
            @for (s of auth.shops(); track s._id) {
              <button class="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3" [disabled]="s.status !== 'Active' || busy()" (click)="pick(s._id)">
                @if (s.shopImage) { <img [src]="s.shopImage" class="shop-avatar" alt="" /> } @else { <span class="shop-avatar shop-avatar-initial">{{ s.shopName.slice(0, 1) }}</span> }
                <span class="flex-grow-1 text-start">
                  <span class="d-block fw-semibold">{{ s.shopName }}</span>
                  <small class="text-muted">{{ s.tahsil }}</small>
                  @if (s.status === 'Blocked') { <small class="d-block text-danger">Blocked: {{ s.blockReason }}</small> }
                </span>
                <app-status-badge [status]="s.status" />
              </button>
            }
          </div>
          <button class="btn btn-link w-100 mt-3" (click)="auth.logout(false)">Use another number</button>
        </div>
      </div>
    </div>
  `,
})
export class SelectShopComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  busy = signal(false);

  ngOnInit() {
    if (!this.auth.ownerToken && !this.auth.token) this.router.navigate(['/login']);
  }

  pick(id: string) {
    this.busy.set(true);
    this.auth.selectShop(id).subscribe({
      next: (s) => {
        this.toast.success(`Welcome to ${s.shopName}`);
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(errorMessage(e));
        if (e.status === 401) this.router.navigate(['/login']);
      },
    });
  }
}
