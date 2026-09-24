import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Address } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

/** Add / edit a delivery address. Emits the saved address. */
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
        <div class="col-7"><label class="form-label">Name</label><input class="form-control" name="name" [(ngModel)]="m.name" maxlength="80" placeholder="Receiver's name" /></div>
        <div class="col-5"><label class="form-label">Phone</label><input class="form-control" name="phone" [(ngModel)]="m.phoneNumber" maxlength="10" inputmode="numeric" placeholder="10 digits" /></div>
        <div class="col-12"><label class="form-label required">House no., street, area, landmark</label><textarea class="form-control" name="full" rows="2" [(ngModel)]="m.fullAddress" required minlength="5" maxlength="300"></textarea></div>
        <div class="col-6"><label class="form-label">City / village</label><input class="form-control" name="city" [(ngModel)]="m.city" maxlength="60" /></div>
        <div class="col-6"><label class="form-label">PIN code</label><input class="form-control" name="zip" [(ngModel)]="m.zipCode" maxlength="6" inputmode="numeric" /></div>
        <div class="col-12"><label class="form-label">State</label><input class="form-control" name="state" [(ngModel)]="m.state" maxlength="60" /></div>
      </div>
      <div class="d-flex align-items-center justify-content-between mt-3 flex-wrap gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="locate()" [disabled]="locating()">
          @if (locating()) { <span class="spinner-border spinner-border-sm me-1"></span> } @else { <i class="bi bi-crosshair me-1"></i> }{{ m.latitude ? 'Location added ✓' : 'Add my location' }}
        </button>
        <div class="form-check mb-0">
          <input class="form-check-input" type="checkbox" id="def" name="def" [(ngModel)]="m.isDefault" />
          <label class="form-check-label small" for="def">Make default</label>
        </div>
      </div>
      @if (err()) { <div class="alert alert-danger small py-2 mt-3 mb-0">{{ err() }}</div> }
      <button class="btn btn-primary w-100 mt-3" [disabled]="busy() || !f.valid">@if (busy()) { <span class="spinner-border spinner-border-sm me-2"></span> }Save address</button>
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
  locating = signal(false);
  err = signal<string | null>(null);

  ngOnChanges() {
    this.m = this.address ? { ...this.address } : this.blank();
    this.err.set(null);
  }

  private blank(): Partial<Address> {
    const u = this.auth.user();
    return { type: 'Home', name: u?.name || '', phoneNumber: u?.mobileNumber || '', fullAddress: '', city: '', state: '', zipCode: '', isDefault: false };
  }

  locate() {
    if (!navigator.geolocation) return this.toast.warning('Location is not supported on this device');
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.m.latitude = pos.coords.latitude; this.m.longitude = pos.coords.longitude; this.locating.set(false); },
      () => { this.locating.set(false); this.toast.warning('Could not get your location. Please allow location access.'); },
      { timeout: 10000 }
    );
  }

  save() {
    const { _id, ...body } = this.m as Address;
    if (body.phoneNumber && !/^[6-9]\d{9}$/.test(body.phoneNumber)) return this.err.set('Enter a valid 10 digit phone number');
    if (body.zipCode && !/^\d{6}$/.test(body.zipCode)) return this.err.set('PIN code must be 6 digits');
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
