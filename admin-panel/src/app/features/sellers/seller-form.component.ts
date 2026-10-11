import { Component, Input, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Seller } from '../../core/models/api.models';
import { GST_PATTERN, IFSC_PATTERN, MOBILE_PATTERN } from '../../shared/validators/password';
import { AreaPickerComponent, AreaSelection, PageHeaderComponent, StateComponent } from '../../shared';

/** One row of the selling area: a district with all or some of its talukas. */
interface AreaRow { state: string; district: string; talukas: 'all' | string[]; count: number; pins: number }

@Component({
  selector: 'app-seller-form',
  imports: [ReactiveFormsModule, PageHeaderComponent, StateComponent, AreaPickerComponent],
  templateUrl: './seller-form.component.html',
})
export class SellerFormComponent implements OnInit {
  /** Route param (edit mode) */
  @Input() id?: string;
  @ViewChild(AreaPickerComponent) picker?: AreaPickerComponent;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private lookup = inject(LookupService);
  private toast = inject(ToastService);
  private router = inject(Router);
  auth = inject(AuthService);

  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  defaultCommission = signal(5);
  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);
  /** Customers the seller has added (edit mode) */
  customerCount = signal<number | null>(null);

  form = this.fb.group({
    shopName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    ownerName: ['', [Validators.required, Validators.minLength(2)]],
    mobileNumber: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
    email: ['', Validators.email],
    shopAddress: ['', [Validators.required, Validators.minLength(5)]],
    pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    gstNumber: ['', Validators.pattern(GST_PATTERN)],
    upiId: ['', Validators.pattern(/^[\w.-]+@[\w.-]+$/)],
    bankDetails: this.fb.group({
      accountHolder: [''],
      accountNumber: ['', Validators.pattern(/^[0-9X]{6,20}$/)],
      ifscCode: ['', Validators.pattern(IFSC_PATTERN)],
      bankName: [''],
    }),
    useDefaultCommission: [true],
    commissionRate: [null as number | null, [Validators.min(0), Validators.max(100)]],
    customerLimit: [null as number | null, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    status: ['Active'],
    settings: this.fb.group({
      enableDelivery: [false],
      deliveryCharge: [0, Validators.min(0)],
      freeDeliveryAbove: [1000, Validators.min(0)],
      allowCashOnDelivery: [true],
    }),
  });

  get isEdit() {
    return !!this.id;
  }

  ngOnInit() {
    if (this.auth.can('settings.view', 'settings.manage')) {
      this.lookup.settings().subscribe((s) => this.defaultCommission.set(s.commissionSettings.defaultCommission));
    }
    if (!this.auth.can('sellers.commission')) {
      this.form.controls.useDefaultCommission.disable();
      this.form.controls.commissionRate.disable();
    }

    if (this.isEdit) {
      this.loading.set(true);
      this.api.get<any>(`/sellers/${this.id}`).subscribe({
        next: ({ seller, analytics }: { seller: Seller & { serviceArea?: any[] }; analytics: any }) => {
          this.customerCount.set(analytics?.totalCustomers ?? null);
          this.form.patchValue({
            ...seller,
            useDefaultCommission: seller.commissionRate === null || seller.commissionRate === undefined,
            commissionRate: seller.commissionRate,
            bankDetails: { accountHolder: '', accountNumber: '', ifscCode: '', bankName: '', ...(seller.bankDetails || {}) },
            settings: { ...(seller.settings || {}) },
          } as any);
          this.form.controls.mobileNumber.disable(); // mobile is the login identity; change carefully via support
          this.imagePreview.set(seller.shopImage || null);
          const t: any = seller.tahsilId;
          if (t?.name) this.shopArea.set({ ok: true, message: [t.name, t.districtId?.name].filter(Boolean).join(', ') });
          this.area.set((seller.serviceArea || []).map((r) => ({ state: r.state, district: r.district, talukas: r.allTalukas ? 'all' : r.talukas, count: r.talukas.length, pins: r.pincodeCount })));
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.loading.set(false);
        },
      });
    }
  }

  // ---- Shop PIN code -> shop taluka ----
  pinLooking = signal(false);
  shopArea = signal<{ ok: boolean; message: string } | null>(null);

  onPincode() {
    const pin = String(this.form.value.pincode || '').replace(/\D/g, '');
    this.form.patchValue({ pincode: pin }, { emitEvent: false });
    this.shopArea.set(null);
    if (pin.length !== 6) return;
    this.pinLooking.set(true);
    this.api.get<{ state: string; district: string; taluka: string; isActive: boolean }>(`/locations/pincode/${pin}`).subscribe({
      next: (r) => {
        this.pinLooking.set(false);
        const where = `${r.taluka}, ${r.district}, ${r.state}`;
        this.shopArea.set(r.isActive ? { ok: true, message: where } : { ok: false, message: `${where} is turned off in Locations` });
      },
      error: (e) => {
        this.pinLooking.set(false);
        this.shopArea.set({ ok: false, message: e.status === 404 ? 'This PIN code was not found in India Post data' : errorMessage(e) });
      },
    });
  }

  // ---- Selling area: per district, all / several / one taluka ----
  area = signal<AreaRow[]>([]);

  addArea(sel: AreaSelection) {
    const row: AreaRow = { state: sel.state, district: sel.district, talukas: sel.talukas, count: sel.talukaList.length, pins: sel.talukaList.reduce((s, t) => s + t.pincodes.length, 0) };
    this.area.set([...this.area().filter((r) => !(r.state === row.state && r.district === row.district)), row]);
    this.picker?.reset();
  }

  removeArea(i: number) {
    this.area.set(this.area().filter((_, idx) => idx !== i));
  }

  areaLabel(r: AreaRow) {
    return r.talukas === 'all' ? 'All talukas' : r.talukas.join(', ');
  }

  onImage(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Image must be smaller than 5 MB');
      return;
    }
    this.imageFile = file;
    const reader = new FileReader();
    reader.onload = () => this.imagePreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  invalid(path: string) {
    const c = this.form.get(path);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toast.warning('Please fix the highlighted fields');
      return;
    }
    const v = this.form.getRawValue();
    const body: any = {
      shopName: v.shopName,
      ownerName: v.ownerName,
      email: v.email || '',
      shopAddress: v.shopAddress,
      pincode: v.pincode,
      customerLimit: Number(v.customerLimit),
      // Empty = the shop sells only in its own taluka
      serviceArea: this.area().map(({ state, district, talukas }) => ({ state, district, talukas })),
      gstNumber: v.gstNumber || '',
      upiId: v.upiId || '',
      bankDetails: v.bankDetails,
      settings: v.settings,
    };
    if (!this.isEdit) {
      body.mobileNumber = v.mobileNumber;
      body.status = v.status;
    }

    this.saving.set(true);
    const save$ = this.isEdit ? this.api.put<Seller>(`/sellers/${this.id}`, body) : this.api.post<Seller>('/sellers', body);
    save$
      .pipe(
        switchMap((res) => {
          const id = res.data._id;
          if (!this.imageFile) return of(id);
          const fd = new FormData();
          fd.append('image', this.imageFile);
          return forkJoin([of(id), this.http.post(`${this.api.base}/sellers/${id}/image`, fd)]).pipe(switchMap(([sid]) => of(sid)));
        })
      )
      .subscribe({
        next: (sellerId) => {
          this.lookup.invalidate('districts');
          this.lookup.invalidate('tahsils');
          this.toast.success(this.isEdit ? 'Seller updated' : 'Seller created');
          this.router.navigate(['/sellers', sellerId]);
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(errorMessage(e));
        },
      });
  }
}
