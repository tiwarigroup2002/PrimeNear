import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';

export interface Taluka { name: string; pincodes: string[]; savedId?: string | null }
export interface AreaSelection { state: string; district: string; talukas: 'all' | string[]; talukaList: Taluka[] }

/**
 * State -> district -> taluka picker backed by the India location directory (free India Post data).
 * Talukas can be chosen all at once, several, or one ("single" mode).
 */
@Component({
  selector: 'app-area-picker',
  imports: [FormsModule],
  template: `
    <div class="row g-2">
      <div class="col-md-6">
        <label class="form-label small">State</label>
        <select class="form-select form-select-sm" [ngModel]="state()" (ngModelChange)="pickState($event)" [disabled]="statesLoading()">
          <option value="">{{ statesLoading() ? 'Loading states…' : 'Select state' }}</option>
          @for (s of states(); track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label small">District</label>
        <select class="form-select form-select-sm" [ngModel]="district()" (ngModelChange)="pickDistrict($event)" [disabled]="!state() || districtsLoading()">
          <option value="">{{ districtsLoading() ? 'Loading…' : 'Select district' }}</option>
          @for (d of districts(); track d) { <option [value]="d">{{ d }}</option> }
        </select>
      </div>
    </div>
    @if (error()) { <div class="alert alert-warning small py-2 mt-2 mb-0">{{ error() }}</div> }
    @if (district()) {
      <div class="mt-2">
        <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
          <label class="form-label small mb-0">Talukas @if (talukas().length) { ({{ chosen().size }} of {{ talukas().length }}) }</label>
          @if (mode !== 'single' && talukas().length) {
            <div class="form-check mb-0">
              <input class="form-check-input" type="checkbox" id="ap-all-{{ uid }}" [checked]="allChosen()" (change)="toggleAll($any($event.target).checked)" />
              <label class="form-check-label small fw-semibold" for="ap-all-{{ uid }}">All talukas</label>
            </div>
          }
        </div>
        @if (talukasLoading()) { <div class="small text-muted"><span class="spinner-border spinner-border-sm me-1"></span>Loading talukas…</div> }
        <div class="taluka-grid">
          @for (t of talukas(); track t.name) {
            <label class="taluka-option" [class.on]="chosen().has(t.name)">
              <input [type]="mode === 'single' ? 'radio' : 'checkbox'" [name]="'ap-' + uid" class="form-check-input me-2" [checked]="chosen().has(t.name)" (change)="toggle(t.name, $any($event.target).checked)" />
              <span class="flex-grow-1">{{ t.name }} @if (t.savedId) { <i class="bi bi-check2-circle text-success" title="Already in Locations"></i> }</span>
              <small class="text-muted">{{ t.pincodes.length }} PIN</small>
            </label>
          }
        </div>
        @if (chosenPins()) { <div class="form-text">{{ chosenPins() }} PIN codes selected.</div> }
      </div>
    }
    @if (actionLabel) {
      <button type="button" class="btn btn-sm btn-primary mt-2" [disabled]="!chosen().size" (click)="emit()"><i class="bi bi-plus-lg me-1"></i>{{ actionLabel }}</button>
    }
  `,
})
export class AreaPickerComponent implements OnInit {
  /** 'multi' (all / several talukas) or 'single' (one taluka) */
  @Input() mode: 'multi' | 'single' = 'multi';
  /** When set, shows a button that emits `picked`; otherwise every change is emitted. */
  @Input() actionLabel = '';
  @Input() defaultState = 'Madhya Pradesh';
  @Output() picked = new EventEmitter<AreaSelection>();
  @Output() changed = new EventEmitter<AreaSelection | null>();

  private api = inject(ApiService);
  uid = Math.random().toString(36).slice(2, 8);
  states = signal<string[]>([]);
  districts = signal<string[]>([]);
  talukas = signal<Taluka[]>([]);
  state = signal('');
  district = signal('');
  chosen = signal(new Set<string>());
  statesLoading = signal(false);
  districtsLoading = signal(false);
  talukasLoading = signal(false);
  error = signal<string | null>(null);
  allChosen = computed(() => this.talukas().length > 0 && this.chosen().size === this.talukas().length);
  chosenPins = computed(() => this.talukas().filter((t) => this.chosen().has(t.name)).reduce((s, t) => s + t.pincodes.length, 0));

  ngOnInit() {
    this.statesLoading.set(true);
    this.api.get<string[]>('/locations/directory/states').subscribe({
      next: (s) => {
        this.states.set(s);
        this.statesLoading.set(false);
        if (this.defaultState && s.includes(this.defaultState)) this.pickState(this.defaultState);
      },
      error: (e) => { this.statesLoading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  pickState(s: string) {
    this.state.set(s);
    this.district.set('');
    this.districts.set([]);
    this.talukas.set([]);
    this.setChosen(new Set());
    if (!s) return;
    this.districtsLoading.set(true);
    this.api.get<string[]>('/locations/directory/districts', { state: s }).subscribe({
      next: (d) => { this.districts.set(d); this.districtsLoading.set(false); },
      error: (e) => { this.districtsLoading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  pickDistrict(d: string) {
    this.district.set(d);
    this.talukas.set([]);
    this.setChosen(new Set());
    if (!d) return;
    this.talukasLoading.set(true);
    this.api.get<Taluka[]>('/locations/directory/talukas', { state: this.state(), district: d }).subscribe({
      next: (t) => {
        this.talukas.set(t);
        this.talukasLoading.set(false);
        if (t.length === 1) this.setChosen(new Set([t[0].name]));
      },
      error: (e) => { this.talukasLoading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  toggle(name: string, on: boolean) {
    const next = this.mode === 'single' ? new Set<string>() : new Set(this.chosen());
    on ? next.add(name) : next.delete(name);
    this.setChosen(next);
  }

  toggleAll(on: boolean) {
    this.setChosen(on ? new Set(this.talukas().map((t) => t.name)) : new Set());
  }

  /** Clears the taluka choice (after the parent used it). */
  reset() {
    this.setChosen(new Set());
  }

  private selection(): AreaSelection | null {
    if (!this.chosen().size) return null;
    return {
      state: this.state(),
      district: this.district(),
      talukas: this.allChosen() && this.mode !== 'single' ? 'all' : [...this.chosen()],
      talukaList: this.talukas().filter((t) => this.chosen().has(t.name)),
    };
  }

  private setChosen(s: Set<string>) {
    this.chosen.set(s);
    this.changed.emit(this.selection());
  }

  emit() {
    const s = this.selection();
    if (s) this.picked.emit(s);
  }
}
