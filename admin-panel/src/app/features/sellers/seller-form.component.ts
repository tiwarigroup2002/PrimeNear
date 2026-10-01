import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { District, Seller, Tahsil } from '../../core/models/api.models';
import { GST_PATTERN, IFSC_PATTERN, MOBILE_PATTERN } from '../../shared/validators/password';
import { PageHeaderComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-seller-form',
  imports: [ReactiveFormsModule, PageHeaderComponent, StateComponent],
  templateUrl: './seller-form.component.html',
})
export class SellerFormComponent implements OnInit {
  /** Route param (edit mode) */
  @Input() id?: string;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private lookup = inject(LookupService);
  private toast = inject(ToastService);
  private router = inject(Router);
  auth = inject(AuthService);

  tahsils = signal<Tahsil[]>([]);
  districts = signal<District[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  defaultCommission = signal(5);
  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);

  form = this.fb.group({
    shopName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    ownerName: ['', [Validators.required, Validators.minLength(2)]],
    mobileNumber: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
    email: ['', Validators.email],
    tahsilId: ['', Validators.required],
    districtIds: [[] as string[]],
    sellsAcrossDistricts: [false],
    shopAddress: ['', [Validators.required, Validators.minLength(5)]],
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
    this.lookup.tahsils().subscribe((t) => this.tahsils.set(t.filter((x) => x.isActive)));
    this.lookup.districts().subscribe((d) => this.districts.set(d.filter((x) => x.isActive)));
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
        next: ({ seller }: { seller: Seller }) => {
          this.form.patchValue({
            ...seller,
            tahsilId: seller.tahsilId?._id ?? seller.tahsilId,
            districtIds: seller.districtIds.map((d: any) => d._id ?? d),
            sellsAcrossDistricts: !!seller.sellsAcrossDistricts,
            useDefaultCommission: seller.commissionRate === null || seller.commissionRate === undefined,
            commissionRate: seller.commissionRate,
            bankDetails: { accountHolder: '', accountNumber: '', ifscCode: '', bankName: '', ...(seller.bankDetails || {}) },
            settings: { ...(seller.settings || {}) },
          } as any);
          this.form.controls.mobileNumber.disable(); // mobile is the login identity; change carefully via support
          this.imagePreview.set(seller.shopImage || null);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.loading.set(false);
        },
      });
    }
  }

  /** When the tahsil changes, pre-select its district. */
  onTahsilChange() {
    const t = this.tahsils().find((x) => x._id === this.form.value.tahsilId);
    const districtId = (t?.districtId as any)?._id ?? t?.districtId;
    const current = this.form.value.districtIds || [];
    if (districtId && !current.includes(districtId)) this.form.patchValue({ districtIds: [...current, districtId] });
  }

  toggleDistrict(id: string, checked: boolean) {
    const current = new Set(this.form.value.districtIds || []);
    checked ? current.add(id) : current.delete(id);
    this.form.patchValue({ districtIds: [...current] });
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
      tahsilId: v.tahsilId,
      districtIds: v.districtIds,
      sellsAcrossDistricts: !!v.sellsAcrossDistricts,
      shopAddress: v.shopAddress,
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
