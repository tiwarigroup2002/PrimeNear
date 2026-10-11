import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Address } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

interface PinInfo { state: string; district: string; taluka: string }

/**
 * Add / edit an address. The PIN code is required: it fills the taluka, district and
 * state (India Post data) and decides which shops can deliver there.
 */
@Component({
  selector: 'app-address-form',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="save()" #f="ngForm">
      <div class="d-flex gap-2 mb-3">
        @for (t of types; track t.v) {
          <button type="button" class="chip" [class.active]="m.type === t.v" (click)="m.type = t.v"><i class="bi {{ t.i }} me-1"></i>{{ t.v }}</button>
        }
      </div>
      <div class="row g-2">
        <div class="col-6">
          <label class="form-label required" for="af-zip">PIN code</label>
          <div class="input-group">
            <input id="af-zip" class="form-control" name="zip" [(ngModel)]="m.zipCode" (ngModelChange)="onPin($event)" maxlength="6" inputmode="numeric" required pattern="\\d{6}" placeholder="6 digits" />
            @if (pinLooking()) { <span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span> }
          </div>
        </div>
        <div class="col-6 d-flex align-items-end">
          @if (pin(); as p) {
            <div class="small text-success lh-sm pb-1"><i class="bi bi-geo-alt-fill me-1"></i>{{ p.taluka }}, {{ p.district }}<br />{{ p.state }}</div>
          } @else if (pinError()) {
            <div class="small text-danger lh-sm pb-1">{{ pinError() }}</div>
          } @else {
            <div class="small text-muted lh-sm pb-1">District and state fill in from the PIN code</div>
          }
        </div>
        <div class="col-12"><label class="form-label required">House no., street, area, landmark</label><textarea class="form-control" name="full" rows="2" [(ngModel)]="m.fullAddress" required minlength="5" maxlength="300"></textarea></div>
        <div class="col-12"><label class="form-label">City / village</label><input class="form-control" name="city" [(ngModel)]="m.city" maxlength="60" /></div>
        <div class="col-7"><label class="form-label">Name</label><input class="form-control" name="name" [(ngModel)]="m.name" maxlength="80" placeholder="Receiver's name" /></div>
        <div class="col-5"><label class="form-label">Phone</label><input class="form-control" name="phone" [(ngModel)]="m.phoneNumber" maxlength="10" inputmode="numeric" placeholder="10 digits" /></div>
      </div>
      <div class="form-check mt-3 mb-0">
        <input class="form-check-input" type="checkbox" id="def" name="def" [(ngModel)]="m.isDefault" />
        <label class="form-check-label small" for="def">Make default</label>
      </div>
      @if (err()) { <div class="alert alert-danger small py-2 mt-3 mb-0">{{ err() }}</div> }
      <button class="btn btn-primary w-100 mt-3" [disabled]="busy() || !f.valid || !pin()">@if (busy()) { <span class="spinner-border spinner-border-sm me-2"></span> }Save address</button>
    </form>
  `,
})
export class AddressFormComponent implements OnChanges {
  @Input() address: Address | null = null;
  @Output() saved = new EventEmitter<Address>();
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  types = [{ v: 'Home' as const, i: 'bi-house' }, { v: 'Work' as const, i: 'bi-briefcase' }, { v: 'Other' as const, i: 'bi-geo-alt' }];
  m: Partial<Address> = this.blank();
  busy = signal(false);
  err = signal<string | null>(null);
  pin = signal<PinInfo | null>(null);
  pinError = signal<string | null>(null);
  pinLooking = signal(false);

  ngOnChanges() {
    this.m = this.address ? { ...this.address } : this.blank();
    this.err.set(null);
    this.pin.set(null);
    this.pinError.set(null);
    if (this.m.zipCode) this.onPin(this.m.zipCode);
  }

  private blank(): Partial<Address> {
    const u = this.auth.user();
    return { type: 'Home', name: u?.name || '', phoneNumber: u?.mobileNumber || '', fullAddress: '', city: '', zipCode: '', isDefault: false };
  }

  onPin(value: string) {
    const pin = String(value || '').replace(/\D/g, '').slice(0, 6);
    if (pin !== value) setTimeout(() => (this.m.zipCode = pin));
    this.pin.set(null);
    this.pinError.set(null);
    if (pin.length !== 6) return;
    this.pinLooking.set(true);
    this.api.get<PinInfo>(`/pincode/${pin}`).subscribe({
      next: (r) => {
        this.pinLooking.set(false);
        if (this.m.zipCode !== pin) return;
        this.pin.set(r);
        if (!this.m.city) this.m.city = r.taluka;
      },
      error: (e) => {
        this.pinLooking.set(false);
        this.pinError.set(e.status === 404 ? 'This PIN code was not found' : errorMessage(e));
      },
    });
  }

  save() {
    const { _id, state, district, taluka, ...body } = this.m as Address;
    if (body.phoneNumber && !/^[6-9]\d{9}$/.test(body.phoneNumber)) return this.err.set('Enter a valid 10 digit phone number');
    if (!/^\d{6}$/.test(body.zipCode || '')) return this.err.set('PIN code must be 6 digits');
    this.busy.set(true);
    this.err.set(null);
    const req = _id ? this.api.put<Address>(`/addresses/${_id}`, body) : this.api.post<Address>('/addresses', body);
    req.subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(r.message || 'Address saved');
        this.auth.refreshMe().subscribe({ error: () => {} });
        this.saved.emit(r.data);
      },
      error: (e) => { this.busy.set(false); this.err.set(errorMessage(e)); },
    });
  }
}
