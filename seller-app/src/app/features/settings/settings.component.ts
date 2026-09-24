import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { GST_PATTERN, IFSC_PATTERN, UPI_PATTERN } from '../../shared/validators/patterns';
import { PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, PageHeaderComponent, StateComponent],
  template: `
    <app-page-header title="Settings" />
    <app-state [loading]="!shop()" />
    @if (shop(); as s) {
      <div class="accordion mb-3" id="acc">
        <!-- Shop -->
        <div class="accordion-item">
          <h2 class="accordion-header"><button class="accordion-button" [class.collapsed]="open() !== 'shop'" (click)="toggle('shop')"><i class="bi bi-shop me-2"></i>Shop details</button></h2>
          @if (open() === 'shop') {
            <div class="accordion-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                @if (s.shopImage) { <img [src]="s.shopImage" class="shop-avatar" style="width:64px;height:64px" alt="" /> } @else { <span class="shop-avatar shop-avatar-initial" style="width:64px;height:64px;font-size:1.6rem">{{ s.shopName.slice(0, 1) }}</span> }
                <div><div class="fw-semibold">{{ s.shopName }}</div><div class="small text-muted">{{ s.mobileNumber }} · {{ s.tahsilId?.name }}</div>
                  <label class="btn btn-sm btn-link px-0">Change photo<input type="file" accept="image/*" hidden (change)="photo($event)" /></label></div>
              </div>
              <label class="form-label">Owner name</label><input class="form-control mb-2" [(ngModel)]="profile.ownerName" />
              <label class="form-label">Email</label><input class="form-control mb-2" type="email" [(ngModel)]="profile.email" />
              <label class="form-label">Shop address</label><textarea class="form-control mb-2" rows="2" [(ngModel)]="profile.shopAddress"></textarea>
              <label class="form-label">GST number</label><input class="form-control mb-2 text-uppercase" [(ngModel)]="profile.gstNumber" placeholder="23AABCT0123A1Z0" />
              <div class="form-text mb-2">Shop name, mobile number and location can only be changed by the admin.</div>
              <button class="btn btn-primary" (click)="saveProfile()">Save</button>
            </div>
          }
        </div>
        <!-- Bank -->
        <div class="accordion-item">
          <h2 class="accordion-header"><button class="accordion-button" [class.collapsed]="open() !== 'bank'" (click)="toggle('bank')"><i class="bi bi-bank me-2"></i>Bank / UPI for payouts</button></h2>
          @if (open() === 'bank') {
            <div class="accordion-body">
              <label class="form-label">Account holder</label><input class="form-control mb-2" [(ngModel)]="bank.accountHolder" />
              <label class="form-label">Account number</label><input class="form-control mb-2" inputmode="numeric" [(ngModel)]="bank.accountNumber" />
              <div class="row g-2">
                <div class="col-6"><label class="form-label">IFSC</label><input class="form-control text-uppercase" [(ngModel)]="bank.ifscCode" /></div>
                <div class="col-6"><label class="form-label">Bank name</label><input class="form-control" [(ngModel)]="bank.bankName" /></div>
              </div>
              <label class="form-label mt-2">UPI ID</label><input class="form-control mb-2" [(ngModel)]="bank.upiId" placeholder="shop@upi" />
              <div class="alert alert-warning small py-2">For your safety the admin is informed whenever these details change.</div>
              <button class="btn btn-primary" (click)="saveBank()">Save</button>
            </div>
          }
        </div>
        <!-- Delivery -->
        <div class="accordion-item">
          <h2 class="accordion-header"><button class="accordion-button" [class.collapsed]="open() !== 'delivery'" (click)="toggle('delivery')"><i class="bi bi-truck me-2"></i>Delivery & payment</button></h2>
          @if (open() === 'delivery') {
            <div class="accordion-body">
              <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="ed" [(ngModel)]="settings.enableDelivery" /><label class="form-check-label" for="ed">I deliver to customers' homes</label></div>
              @if (settings.enableDelivery) {
                <div class="row g-2 mb-2">
                  <div class="col-6"><label class="form-label">Delivery charge (₹)</label><input type="number" min="0" class="form-control" [(ngModel)]="settings.deliveryCharge" /></div>
                  <div class="col-6"><label class="form-label">Free above (₹)</label><input type="number" min="0" class="form-control" [(ngModel)]="settings.freeDeliveryAbove" /></div>
                </div>
              }
              <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="cod" [(ngModel)]="settings.allowCashOnDelivery" /><label class="form-check-label" for="cod">Accept cash on delivery for app orders</label></div>
              <button class="btn btn-primary" (click)="saveSettings()">Save</button>
            </div>
          }
        </div>
        <!-- Notifications -->
        <div class="accordion-item">
          <h2 class="accordion-header"><button class="accordion-button" [class.collapsed]="open() !== 'notif'" (click)="toggle('notif')"><i class="bi bi-bell me-2"></i>Notifications</button></h2>
          @if (open() === 'notif') {
            <div class="accordion-body">
              <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="np" [(ngModel)]="settings.notifications.push" /><label class="form-check-label" for="np">App notifications</label></div>
              <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="nw" [(ngModel)]="settings.notifications.whatsapp" /><label class="form-check-label" for="nw">WhatsApp messages (new orders)</label></div>
              <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="ns" [(ngModel)]="settings.notifications.sms" /><label class="form-check-label" for="ns">SMS alerts</label></div>
              <button class="btn btn-primary" (click)="saveSettings()">Save</button>
            </div>
          }
        </div>
        <!-- Account -->
        <div class="accordion-item">
          <h2 class="accordion-header"><button class="accordion-button" [class.collapsed]="open() !== 'account'" (click)="toggle('account')"><i class="bi bi-person-gear me-2"></i>App & account</button></h2>
          @if (open() === 'account') {
            <div class="accordion-body">
              <div class="d-flex justify-content-between align-items-center mb-3"><span>Dark mode</span>
                <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" [checked]="theme.theme() === 'dark'" (change)="theme.toggle()" /></div></div>
              <div class="d-flex justify-content-between mb-2"><span>Platform commission</span><strong>{{ s.effectiveCommissionRate }}%</strong></div>
              <div class="d-flex justify-content-between mb-3"><span>Sells in</span><span>@for (d of s.districtIds; track d._id) { <span class="badge text-bg-light border ms-1">{{ d.name }}</span> }</span></div>
              <button class="btn btn-outline-danger w-100" (click)="logout()"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  theme = inject(ThemeService);

  shop = signal<any>(null);
  open = signal<string>('shop');
  profile: any = {};
  bank: any = {};
  settings: any = { notifications: {} };

  ngOnInit() {
    this.load();
  }

  toggle(k: string) {
    this.open.set(this.open() === k ? '' : k);
  }

  load() {
    this.api.get<any>('/settings').subscribe((r) => this.apply(r.shop));
  }

  private apply(s: any) {
    this.shop.set(s);
    this.auth.setSeller(s);
    this.profile = { ownerName: s.ownerName, email: s.email || '', shopAddress: s.shopAddress, gstNumber: s.gstNumber || '' };
    this.bank = { accountHolder: '', accountNumber: '', ifscCode: '', bankName: '', ...(s.bankDetails || {}), upiId: s.upiId || '' };
    const st = s.settings || {};
    this.settings = { enableDelivery: !!st.enableDelivery, deliveryCharge: st.deliveryCharge ?? 0, freeDeliveryAbove: st.freeDeliveryAbove ?? 1000, allowCashOnDelivery: st.allowCashOnDelivery !== false, notifications: { push: true, whatsapp: true, sms: true, ...(st.notifications || {}) } };
  }

  private done = (msg: string) => ({
    next: (r: any) => { this.toast.success(msg); this.apply(r.data); },
    error: (e: any) => this.toast.error(errorMessage(e)),
  });

  saveProfile() {
    const g = this.profile.gstNumber.trim().toUpperCase();
    if (g && !GST_PATTERN.test(g)) return this.toast.warning('Invalid GST number');
    this.api.put<any>('/profile', { ...this.profile, gstNumber: g }).subscribe(this.done('Shop details saved'));
  }

  saveBank() {
    const b = this.bank;
    if (b.ifscCode && !IFSC_PATTERN.test(b.ifscCode)) return this.toast.warning('Invalid IFSC code');
    if (b.accountNumber && !/^[0-9X]{6,20}$/.test(b.accountNumber)) return this.toast.warning('Account number must be 6–20 digits');
    if (b.upiId && !UPI_PATTERN.test(b.upiId)) return this.toast.warning('Invalid UPI ID');
    this.api.put<any>('/bank', b).subscribe(this.done('Payout details saved'));
  }

  saveSettings() {
    const s = this.settings;
    this.api.put<any>('/settings', { ...s, deliveryCharge: Number(s.deliveryCharge) || 0, freeDeliveryAbove: Number(s.freeDeliveryAbove) || 0 }).subscribe(this.done('Settings saved'));
  }

  photo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('image', f);
    this.http.post<any>(`${this.api.base}/profile/image`, fd).subscribe({ next: () => { this.toast.success('Photo updated'); this.load(); }, error: (err) => this.toast.error(errorMessage(err)) });
  }

  async logout() {
    if (await this.confirm.confirm('Logout?', 'You will need an OTP to login again.', 'primary', 'Logout')) this.auth.logout();
  }
}
