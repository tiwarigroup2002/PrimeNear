import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { District, Tahsil } from '../../core/models/api.models';
import { MapPickerComponent, ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

interface TahsilForm { _id?: string; districtId?: string; name: string; latitude: number | null; longitude: number | null; radius: number; pincodes: string; isActive: boolean }

@Component({
  selector: 'app-locations',
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, StateComponent, StatusBadgeComponent, ModalComponent, MapPickerComponent],
  templateUrl: './locations.component.html',
})
export class LocationsComponent implements OnInit {
  private api = inject(ApiService);
  private lookup = inject(LookupService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  districts = signal<District[]>([]);
  tahsils = signal<Tahsil[]>([]);
  selected = signal<District | null>(null);
  loading = signal(true);
  tLoading = signal(false);
  saving = signal(false);

  districtOpen = signal(false);
  districtForm: { _id?: string; name: string; state: string; isActive: boolean; tahsils: TahsilForm[] } = { name: '', state: '', isActive: true, tahsils: [] };

  tahsilOpen = signal(false);
  tahsilForm: TahsilForm = this.blankTahsil();

  ngOnInit() {
    this.loadDistricts();
  }

  blankTahsil(): TahsilForm {
    return { name: '', latitude: null, longitude: null, radius: 5, pincodes: '', isActive: true };
  }

  loadDistricts() {
    this.api.get<District[]>('/locations/districts').subscribe((d) => {
      this.districts.set(d);
      this.loading.set(false);
      const sel = this.selected();
      if (sel) this.selected.set(d.find((x) => x._id === sel._id) ?? null);
      else if (d.length) this.select(d[0]);
    });
  }

  select(d: District) {
    this.selected.set(d);
    this.loadTahsils();
  }

  loadTahsils() {
    this.tLoading.set(true);
    this.api.get<Tahsil[]>('/locations/tahsils', { district: this.selected()!._id }).subscribe((t) => {
      this.tahsils.set(t);
      this.tLoading.set(false);
    });
  }

  private refreshLookups() {
    this.lookup.invalidate('districts');
    this.lookup.invalidate('tahsils');
  }

  // ---- Districts ----
  openDistrict(d?: District) {
    this.districtForm = d ? { _id: d._id, name: d.name, state: d.state || '', isActive: d.isActive, tahsils: [] } : { name: '', state: 'Madhya Pradesh', isActive: true, tahsils: [this.blankTahsil()] };
    this.districtOpen.set(true);
  }

  addTahsilRow() {
    this.districtForm.tahsils.push(this.blankTahsil());
  }

  saveDistrict() {
    const f = this.districtForm;
    if (f.name.trim().length < 2) return this.toast.warning('District name is required');
    const tahsils = f.tahsils.filter((t) => t.name.trim());
    if (tahsils.some((t) => t.latitude === null || t.longitude === null)) return this.toast.warning('Every tahsil needs latitude and longitude');
    this.saving.set(true);
    const req = f._id
      ? this.api.put(`/locations/districts/${f._id}`, { name: f.name, state: f.state, isActive: f.isActive })
      : this.api.post('/locations/districts', { name: f.name, state: f.state, isActive: f.isActive, tahsils: tahsils.map(({ isActive, ...t }) => ({ ...t, isActive })) });
    req.subscribe({
      next: () => { this.saving.set(false); this.districtOpen.set(false); this.toast.success('District saved'); this.refreshLookups(); this.loadDistricts(); if (this.selected()) this.loadTahsils(); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async removeDistrict(d: District) {
    if (!(await this.confirm.confirm(`Delete district "${d.name}"?`, 'All its tahsils are deleted too. Districts with sellers cannot be deleted – deactivate instead.'))) return;
    this.api.delete(`/locations/districts/${d._id}`).subscribe({
      next: () => { this.toast.success('District deleted'); if (this.selected()?._id === d._id) this.selected.set(null); this.refreshLookups(); this.loadDistricts(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  toggleDistrict(d: District) {
    this.api.put(`/locations/districts/${d._id}`, { isActive: !d.isActive }).subscribe({ next: () => { this.refreshLookups(); this.loadDistricts(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  // ---- Tahsils ----
  openTahsil(t?: Tahsil) {
    this.tahsilForm = t
      ? { _id: t._id, name: t.name, latitude: t.latitude, longitude: t.longitude, radius: t.radius, pincodes: (t.pincodes || []).join(', '), isActive: t.isActive }
      : { ...this.blankTahsil(), districtId: this.selected()!._id };
    this.tahsilOpen.set(true);
  }

  saveTahsil() {
    const t = this.tahsilForm;
    if (t.name.trim().length < 2) return this.toast.warning('Tahsil name is required');
    if (t.latitude === null || t.longitude === null) return this.toast.warning('Pick a location on the map or enter coordinates');
    const pincodes = [...new Set(t.pincodes.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean))];
    if (pincodes.some((p) => !/^\d{6}$/.test(p))) return this.toast.warning('PIN codes must be 6 digits, separated by commas');
    this.saving.set(true);
    const body = { name: t.name, latitude: Number(t.latitude), longitude: Number(t.longitude), radius: Number(t.radius), pincodes, isActive: t.isActive };
    const req = t._id ? this.api.put(`/locations/tahsils/${t._id}`, body) : this.api.post('/locations/tahsils', { ...body, districtId: this.selected()!._id });
    req.subscribe({
      next: () => { this.saving.set(false); this.tahsilOpen.set(false); this.toast.success('Tahsil saved'); this.refreshLookups(); this.loadTahsils(); this.loadDistricts(); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async removeTahsil(t: Tahsil) {
    if (!(await this.confirm.confirm(`Delete tahsil "${t.name}"?`, 'Tahsils with sellers cannot be deleted – deactivate instead.'))) return;
    this.api.delete(`/locations/tahsils/${t._id}`).subscribe({
      next: () => { this.toast.success('Tahsil deleted'); this.refreshLookups(); this.loadTahsils(); this.loadDistricts(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  toggleTahsil(t: Tahsil) {
    this.api.put(`/locations/tahsils/${t._id}`, { isActive: !t.isActive }).subscribe({ next: () => { this.refreshLookups(); this.loadTahsils(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
