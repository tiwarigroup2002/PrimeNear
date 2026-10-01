import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LookupService } from '../../core/services/lookup.service';
import { PlatformService } from '../../core/services/platform.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent, StateComponent } from '../../shared';

type Tab = 'general' | 'commission' | 'gst' | 'delivery' | 'payment' | 'notifications' | 'security' | 'maintenance';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, DatePipe, PageHeaderComponent, StateComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private lookup = inject(LookupService);
  private platform = inject(PlatformService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  auth = inject(AuthService);

  tabs: [Tab, string, string][] = [
    ['general', 'General', 'bi-sliders'],
    ['commission', 'Commission & payouts', 'bi-percent'],
    ['gst', 'GST slabs', 'bi-receipt'],
    ['delivery', 'Delivery', 'bi-truck'],
    ['payment', 'Payment methods', 'bi-credit-card'],
    ['notifications', 'Notifications', 'bi-bell'],
    ['security', 'Security', 'bi-shield-lock'],
    ['maintenance', 'Maintenance', 'bi-cone-striped'],
  ];
  tab = signal<Tab>((inject(ActivatedRoute).snapshot.queryParamMap.get('tab') as Tab) || 'general');
  s = signal<any>(null);
  loading = signal(true);
  saving = signal(false);
  canEdit = this.auth.can('settings.manage');

  // Working copies per section
  general: any = {};
  commission: any = {};
  slabs: { percentage: number; description: string }[] = [];
  delivery: any = {};
  partners = '';
  payment: any = {};
  notifications: any = {};
  security: any = {};
  maintenance = { enabled: false, message: '' };

  ngOnInit() {
    this.load();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
  }

  load() {
    this.api.get<any>('/settings').subscribe({
      next: (s) => {
        this.s.set(s);
        this.general = { platformName: s.platformName, platformDescription: s.platformDescription || '', website: s.website || '', supportEmail: s.supportEmail || '', supportPhone: s.supportPhone || '', supportHours: { ...s.supportHours }, lowStockThreshold: s.lowStockThreshold };
        this.commission = { ...s.commissionSettings };
        this.slabs = s.gstSettings.slabs.map((x: any) => ({ ...x }));
        this.delivery = { ...s.deliverySettings };
        this.partners = (s.deliverySettings.deliveryPartners || []).join(', ');
        this.payment = { ...s.paymentSettings };
        this.notifications = { ...s.notificationSettings };
        this.security = { ...s.securitySettings };
        this.maintenance = { enabled: s.maintenanceMode, message: s.maintenanceMessage || '' };
        this.loading.set(false);
      },
      error: (e) => { this.toast.error(errorMessage(e)); this.loading.set(false); },
    });
  }

  private save(url: string, body: any, method: 'put' | 'post' = 'put') {
    this.saving.set(true);
    (method === 'put' ? this.api.put<any>(url, body) : this.api.post<any>(url, body)).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.toast.success(r.message || 'Saved');
        this.lookup.invalidate('settings');
        this.platform.load();
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  saveGeneral() {
    const g = this.general;
    this.save('/settings', { ...g, lowStockThreshold: Number(g.lowStockThreshold) });
  }

  saveCommission() {
    const c = this.commission;
    this.save('/settings/commission', { defaultCommission: 0, commissionType: 'Percentage', payoutFrequency: c.payoutFrequency, payoutDelayDays: Number(c.payoutDelayDays), chargeCommissionOnCash: false });
  }

  addSlab() {
    this.slabs.push({ percentage: 0, description: '' });
  }

  saveGst() {
    this.save('/settings/gst', { slabs: this.slabs.map((s) => ({ percentage: Number(s.percentage), description: s.description })) });
  }

  saveDelivery() {
    const d = this.delivery;
    this.save('/settings/delivery', { enableDelivery: d.enableDelivery, defaultDeliveryCharge: Number(d.defaultDeliveryCharge), freeDeliveryAbove: Number(d.freeDeliveryAbove), deliveryPartners: this.partners.split(',').map((p) => p.trim()).filter(Boolean) });
  }

  savePayment() {
    if (!this.payment.enableCashPayment && !this.payment.enableOnlinePayment) return this.toast.warning('At least one payment method must be enabled');
    this.save('/settings/payment', this.payment);
  }

  saveNotifications() {
    this.save('/settings/notifications', this.notifications);
  }

  async saveSecurity() {
    const sec = this.security;
    if (sec.enableTwoFactor && !this.s().securitySettings.enableTwoFactor) {
      const ok = await this.confirm.confirm('Make 2FA mandatory?', 'Every admin without 2FA will be asked to set it up at next login.', 'warning', 'Enable');
      if (!ok) return;
    }
    this.save('/settings/security', { enableTwoFactor: sec.enableTwoFactor, sessionTimeout: Number(sec.sessionTimeout), maxLoginAttempts: Number(sec.maxLoginAttempts), lockMinutes: Number(sec.lockMinutes), passwordExpiryDays: Number(sec.passwordExpiryDays) });
  }

  async saveMaintenance() {
    if (this.maintenance.enabled && !this.s().maintenanceMode) {
      const ok = await this.confirm.confirm('Enable maintenance mode?', 'The user and seller apps will show the maintenance message. The admin panel keeps working.', 'warning', 'Enable');
      if (!ok) return;
    }
    this.save('/settings/maintenance-mode', this.maintenance, 'post');
  }

  uploadLogo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('logo', f);
    this.http.post<any>(`${this.api.base}/settings/upload-logo`, fd).subscribe({
      next: () => { this.toast.success('Logo updated'); this.platform.load(); this.load(); },
      error: (err) => this.toast.error(errorMessage(err)),
    });
  }
}
