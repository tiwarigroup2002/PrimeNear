import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { BillItem, TaxMode, computeTotals } from '../../core/utils/bill-math';
import { BillViewComponent, EntitySelectComponent, PageHeaderComponent, StateComponent } from '../../shared';

const day = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const addDays = (d: string, n: number) => day(new Date(new Date(d).getTime() + n * 86400000));

/** Create a subscription bill by hand, or edit a draft. Live preview on the right. */
@Component({
  selector: 'app-bill-editor',
  imports: [FormsModule, PageHeaderComponent, StateComponent, EntitySelectComponent, BillViewComponent],
  template: `
    <app-page-header [title]="id ? 'Edit draft bill' : 'New subscription bill'" icon="bi-receipt-cutoff" [back]="id ? '/subscription-bills/' + id : '/subscription-bills'" backLabel="Subscription bills">
      <button class="btn btn-sm btn-outline-primary" (click)="save(false)" [disabled]="busy()"><i class="bi bi-save me-1"></i>Save draft</button>
      <button class="btn btn-sm btn-primary" (click)="save(true)" [disabled]="busy()"><i class="bi bi-send me-1"></i>Save & issue</button>
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (!loading() && !error()) {
      <div class="row g-3">
        <div class="col-xl-6">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Seller</span></div>
            <div class="card-body">
              @if (id) {
                <div class="fw-semibold">{{ f.billTo.name }}</div>
              } @else {
                <label class="form-label required">Choose seller</label>
                <app-entity-select kind="seller" placeholder="Search shop name or mobile..." (selected)="pickSeller($event)" />
              }
              @if (sellerId) {
                <div class="row g-2 mt-1">
                  <div class="col-sm-6"><label class="form-label small">Bill to (name)</label><input class="form-control form-control-sm" [(ngModel)]="f.billTo.name" (ngModelChange)="touch()" /></div>
                  <div class="col-sm-6"><label class="form-label small">Owner</label><input class="form-control form-control-sm" [(ngModel)]="f.billTo.ownerName" (ngModelChange)="touch()" /></div>
                  <div class="col-12"><label class="form-label small">Address</label><textarea class="form-control form-control-sm" rows="2" [(ngModel)]="f.billTo.address" (ngModelChange)="touch()"></textarea></div>
                  <div class="col-sm-4"><label class="form-label small">GSTIN</label><input class="form-control form-control-sm text-uppercase" [(ngModel)]="f.billTo.gstin" (ngModelChange)="touch()" /></div>
                  <div class="col-sm-4"><label class="form-label small">Phone</label><input class="form-control form-control-sm" [(ngModel)]="f.billTo.phone" (ngModelChange)="touch()" /></div>
                  <div class="col-sm-4"><label class="form-label small">Email</label><input class="form-control form-control-sm" [(ngModel)]="f.billTo.email" (ngModelChange)="touch()" /></div>
                </div>
              }
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Bill details</span></div>
            <div class="card-body row g-2">
              <div class="col-12"><label class="form-label small">Plan name</label><input class="form-control form-control-sm" [(ngModel)]="f.planName" (ngModelChange)="touch()" /></div>
              <div class="col-sm-6"><label class="form-label small">Bill date</label><input type="date" class="form-control form-control-sm" [(ngModel)]="f.invoiceDate" (ngModelChange)="touch()" /></div>
              <div class="col-sm-6"><label class="form-label small">Due date</label><input type="date" class="form-control form-control-sm" [(ngModel)]="f.dueDate" (ngModelChange)="touch()" /></div>
              <div class="col-sm-6"><label class="form-label small">Period from</label><input type="date" class="form-control form-control-sm" [(ngModel)]="f.periodFrom" (ngModelChange)="touch()" /></div>
              <div class="col-sm-6"><label class="form-label small">Period to</label><input type="date" class="form-control form-control-sm" [(ngModel)]="f.periodTo" (ngModelChange)="touch()" /></div>
              <div class="col-sm-6">
                <label class="form-label small">GST type</label>
                <select class="form-select form-select-sm" [(ngModel)]="f.taxMode" (ngModelChange)="touch()">
                  <option value="intra">Same state – CGST + SGST</option>
                  <option value="inter">Other state – IGST</option>
                  <option value="none">No GST</option>
                </select>
                @if (suggested && suggested !== f.taxMode) { <div class="form-text text-warning">Suggested for this seller: {{ suggested === 'intra' ? 'CGST + SGST' : 'IGST' }}</div> }
              </div>
              <div class="col-sm-6"><label class="form-label small">Place of supply</label><input class="form-control form-control-sm" [(ngModel)]="f.placeOfSupply" (ngModelChange)="touch()" /></div>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center"><span class="card-title">Lines</span>
              <button class="btn btn-sm btn-outline-primary" (click)="addLine()"><i class="bi bi-plus-lg me-1"></i>Add line</button></div>
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0" style="min-width: 680px">
                <thead><tr><th style="min-width: 190px">Description</th><th style="width: 90px">HSN/SAC</th><th style="width: 76px">Qty</th><th style="width: 100px">Rate ₹</th><th style="width: 90px">Disc. ₹</th><th style="width: 90px">GST %</th><th></th></tr></thead>
                <tbody>
                  @for (it of f.items; track $index) {
                    <tr>
                      <td><input class="form-control form-control-sm" [(ngModel)]="it.description" (ngModelChange)="touch()" placeholder="e.g. Monthly plan" /></td>
                      <td><input class="form-control form-control-sm" [(ngModel)]="it.hsn" (ngModelChange)="touch()" /></td>
                      <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="it.quantity" (ngModelChange)="touch()" /></td>
                      <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="it.rate" (ngModelChange)="touch()" /></td>
                      <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="it.discount" (ngModelChange)="touch()" /></td>
                      <td>
                        <select class="form-select form-select-sm" [(ngModel)]="it.taxRate" (ngModelChange)="touch()" [disabled]="f.taxMode === 'none'">
                          @for (r of rates; track r) { <option [ngValue]="r">{{ r }}</option> }
                        </select>
                      </td>
                      <td><button class="btn btn-sm btn-link text-danger" (click)="removeLine($index)" [disabled]="f.items.length === 1" aria-label="Remove line"><i class="bi bi-trash"></i></button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center"><span class="card-title">Extra fields on this bill</span>
              <button class="btn btn-sm btn-outline-primary" (click)="f.customFields.push({ label: '', value: '' })"><i class="bi bi-plus-lg me-1"></i>Add field</button></div>
            <div class="card-body">
              @for (c of f.customFields; track $index) {
                <div class="d-flex gap-2 mb-2">
                  <input class="form-control form-control-sm" placeholder="Label (e.g. PO number)" [(ngModel)]="c.label" (ngModelChange)="touch()" />
                  <input class="form-control form-control-sm" placeholder="Value" [(ngModel)]="c.value" (ngModelChange)="touch()" />
                  <button class="btn btn-sm btn-link text-danger" (click)="f.customFields.splice($index, 1); touch()" aria-label="Remove field"><i class="bi bi-x-lg"></i></button>
                </div>
              } @empty { <div class="small text-muted">None. Use this for things like PO number or reference.</div> }
              <label class="form-label small mt-2">Notes</label>
              <textarea class="form-control form-control-sm" rows="2" [(ngModel)]="f.notes" (ngModelChange)="touch()"></textarea>
              <label class="form-label small mt-2">Terms</label>
              <textarea class="form-control form-control-sm" rows="2" [(ngModel)]="f.terms" (ngModelChange)="touch()"></textarea>
            </div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="sticky-xl-top" style="top: 76px">
            <div class="small text-muted mb-2"><i class="bi bi-eye me-1"></i>Preview — the bill number is given when you issue it.</div>
            <app-bill-view [b]="preview()" [t]="template()" />
          </div>
        </div>
      </div>
    }
  `,
})
export class BillEditorComponent implements OnInit {
  /** Draft id when editing */
  @Input() id?: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  rates = [0, 5, 12, 18, 28];
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  template = signal<any>(null);
  private tick = signal(0);
  sellerId = '';
  suggested: TaxMode | '' = '';

  f: any = { billTo: {}, items: [], customFields: [], taxMode: 'intra' };

  preview = computed(() => {
    this.tick();
    const t = computeTotals(this.f.items as BillItem[], this.f.taxMode);
    return { ...this.f, ...t, status: 'Draft' };
  });

  touch() {
    this.tick.update((n) => n + 1);
  }

  ngOnInit() {
    this.api.get<any>('/subscription-bills/template').subscribe({
      next: (t) => {
        this.template.set(t);
        if (this.id) return this.loadDraft();
        const today = day(new Date());
        this.f = {
          billTo: {}, planName: t.defaults?.planName || '', invoiceDate: today, dueDate: addDays(today, t.defaults?.dueInDays ?? 7),
          periodFrom: '', periodTo: '', taxMode: 'intra', placeOfSupply: '', notes: t.notes || '', terms: t.terms || '', customFields: [],
          items: [this.newLine()],
        };
        this.loading.set(false);
        this.touch();
      },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private loadDraft() {
    this.api.get<any>(`/subscription-bills/${this.id}`).subscribe({
      next: ({ bill }) => {
        if (bill.status !== 'Draft') { this.router.navigate(['/subscription-bills', this.id]); return; }
        this.sellerId = bill.sellerId?._id || bill.sellerId;
        this.f = {
          billTo: { ...bill.billTo }, planName: bill.planName, invoiceDate: day(bill.invoiceDate), dueDate: day(bill.dueDate),
          periodFrom: day(bill.periodFrom), periodTo: day(bill.periodTo), taxMode: bill.taxMode, placeOfSupply: bill.placeOfSupply || '',
          notes: bill.notes || '', terms: bill.terms || '', customFields: (bill.customFields || []).map((c: any) => ({ label: c.label, value: c.value })),
          items: bill.items.map((i: any) => ({ description: i.description, hsn: i.hsn, quantity: i.quantity, rate: i.rate, discount: i.discount || 0, taxRate: i.taxRate })),
        };
        this.loading.set(false);
        this.touch();
      },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  newLine(): BillItem {
    const d = this.template()?.defaults || {};
    return { description: this.f?.planName || d.planName || '', hsn: d.hsn || '', quantity: 1, rate: 0, discount: 0, taxRate: d.taxRate ?? 18 };
  }

  addLine() {
    this.f.items.push(this.newLine());
    this.touch();
  }

  removeLine(i: number) {
    this.f.items.splice(i, 1);
    this.touch();
  }

  pickSeller(s: any) {
    this.sellerId = s?._id || '';
    this.suggested = '';
    if (!this.sellerId) { this.f.billTo = {}; this.touch(); return; }
    this.api.get<any>(`/subscription-bills/seller-info/${this.sellerId}`).subscribe({
      next: (info) => {
        this.f.billTo = { ...info.billTo };
        this.f.taxMode = info.taxMode;
        this.suggested = info.taxMode;
        this.f.placeOfSupply = info.placeOfSupply || '';
        this.touch();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  save(issue: boolean) {
    if (!this.sellerId) return this.toast.warning('Choose a seller');
    if (!this.f.items.length || this.f.items.some((i: BillItem) => !String(i.description || '').trim())) return this.toast.warning('Every line needs a description');
    if (this.f.items.some((i: BillItem) => Number(i.rate) < 0 || Number(i.quantity) <= 0)) return this.toast.warning('Check quantity and rate');
    const body: any = {
      ...this.f,
      billTo: Object.fromEntries(['name', 'ownerName', 'address', 'state', 'gstin', 'phone', 'email'].map((k) => [k, this.f.billTo[k] || ''])),
      customFields: this.f.customFields.filter((c: any) => c.label?.trim()),
      items: this.f.items.map((i: BillItem) => ({ description: i.description, hsn: i.hsn || '', quantity: Number(i.quantity), rate: Number(i.rate), discount: Number(i.discount || 0), taxRate: Number(i.taxRate || 0) })),
    };
    ['periodFrom', 'periodTo', 'dueDate'].forEach((k) => { if (!body[k]) body[k] = null; });
    this.busy.set(true);
    const done = (id: string, msg?: string) => { this.busy.set(false); this.toast.success(msg || 'Saved'); this.router.navigate(['/subscription-bills', id]); };
    const fail = (e: any) => { this.busy.set(false); this.toast.error(errorMessage(e)); };
    if (this.id) {
      this.api.put<any>(`/subscription-bills/${this.id}`, body).subscribe({
        next: () => {
          if (!issue) return done(this.id!, 'Draft saved');
          this.api.post<any>(`/subscription-bills/${this.id}/issue`).subscribe({ next: (r) => done(this.id!, r.message), error: fail });
        },
        error: fail,
      });
    } else {
      this.api.post<any>('/subscription-bills', { ...body, sellerId: this.sellerId, issue }).subscribe({ next: (r) => done(r.data._id, r.message), error: fail });
    }
  }
}
