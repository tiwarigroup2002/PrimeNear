import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent } from '../../shared';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="Settings" back="/account" backLabel="Account" />
    <div style="max-width:560px">
      <div class="card mb-3"><div class="card-body">
        <h2 class="h6 fw-semibold">Appearance</h2>
        <div class="d-flex gap-2">
          <button class="option-card" [class.active]="theme.theme() === 'light'" (click)="setTheme('light')"><i class="bi bi-sun big"></i><span>Light</span></button>
          <button class="option-card" [class.active]="theme.theme() === 'dark'" (click)="setTheme('dark')"><i class="bi bi-moon-stars big"></i><span>Dark</span></button>
        </div>
      </div></div>
      <div class="card"><div class="card-body">
        <h2 class="h6 fw-semibold">Notifications</h2>
        @for (n of channels; track n.k) {
          <div class="form-check form-switch d-flex justify-content-between ps-0 py-2 border-bottom">
            <label class="form-check-label" [for]="n.k"><i class="bi {{ n.i }} me-2 text-primary"></i>{{ n.l }}</label>
            <input class="form-check-input ms-0" type="checkbox" role="switch" [id]="n.k" [(ngModel)]="p[n.k]" (ngModelChange)="save()" />
          </div>
        }
        <small class="text-muted d-block mt-2">Order updates are always shown inside the app.</small>
      </div></div>
    </div>
  `,
})
export class SettingsComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  theme = inject(ThemeService);
  channels = [
    { k: 'pushNotifications', l: 'App notifications', i: 'bi-bell' },
    { k: 'smsNotifications', l: 'SMS', i: 'bi-chat-text' },
    { k: 'whatsappNotifications', l: 'WhatsApp', i: 'bi-whatsapp' },
    { k: 'emailNotifications', l: 'Email', i: 'bi-envelope' },
  ];
  p: any = { language: 'en', pushNotifications: true, smsNotifications: true, whatsappNotifications: true, emailNotifications: false, ...(this.auth.user()?.preferences ?? {}) };
  saving = signal(false);

  setTheme(t: 'light' | 'dark') {
    this.theme.set(t);
    this.p.theme = t;
    this.save();
  }

  save() {
    const { language, theme, pushNotifications, emailNotifications, smsNotifications, whatsappNotifications } = this.p;
    this.api.put<any>('/profile/preferences', { language, theme: theme || this.theme.theme(), pushNotifications, emailNotifications, smsNotifications, whatsappNotifications }).subscribe({
      next: (r) => { this.auth.setUser({ ...this.auth.user()!, preferences: r.data }); this.toast.success('Saved'); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
