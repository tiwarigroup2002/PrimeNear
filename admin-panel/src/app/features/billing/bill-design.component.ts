import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { computeTotals, sampleNumber } from '../../core/utils/bill-math';
import { BillViewComponent, PageHeaderComponent, StateComponent } from '../../shared';

const SHOW: { key: string; label: string }[] = [
  { key: 'logo', label: 'Logo' },
  { key: 'companyGstin', label: 'Our GSTIN' },
  { key: 'companyPan', label: 'Our PAN' },
  { key: 'companyContact', label: 'Our phone / email / website' },
  { key: 'sellerGstin', label: 'Seller GSTIN' },
  { key: 'sellerContact', label: 'Seller phone / email' },
  { key: 'placeOfSupply', label: 'Place of supply' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'period', label: 'Subscription period' },
  { key: 'hsn', label: 'HSN / SAC column' },
  { key: 'quantity', label: 'Quantity column' },
  { key: 'discount', label: 'Discount column' },
  { key: 'taxRateColumn', label: 'GST % column' },
  { key: 'amountInWords', label: 'Amount in words' },
  { key: 'bankDetails', label: 'Bank details' },
  { key: 'notes', label: 'Notes' },
  { key: 'terms', label: 'Terms' },
  { key: 'signature', label: 'Signature block' },
  { key: 'paidStamp', label: '"PAID" stamp on paid bills' },
];

const LABELS: { key: string; label: string }[] = [
  { key: 'billTo', label: 'Bill to' }, { key: 'invoiceNo', label: 'Invoice no.' }, { key: 'invoiceDate', label: 'Invoice date' }, { key: 'dueDate', label: 'Due date' },
  { key: 'period', label: 'Period' }, { key: 'description', label: 'Description' }, { key: 'hsn', label: 'HSN/SAC' }, { key: 'quantity', label: 'Qty' },
  { key: 'rate', label: 'Rate' }, { key: 'discount', label: 'Discount' }, { key: 'amount', label: 'Amount' }, { key: 'subtotal', label: 'Taxable value' }, { key: 'total', label: 'Total' },
];

const KEYS = ['company', 'title', 'numberFormat', 'seqPadding', 'layout', 'show', 'labels', 'bank', 'customFields', 'defaults', 'notes', 'terms', 'footer', 'signatureLabel'];

/** Admin customises the subscription bill: company details, fields shown, labels, layout and colours. */
@Component({
  selector: 'app-bill-design',
  imports: [FormsModule, PageHeaderComponent, StateComponent, BillViewComponent],
  template: `
    <app-page-header title="Bill design" icon="bi-palette" back="/subscription-bills" backLabel="Subscription bills" subtitle="Applies to new bills. Issued bills keep the design they were issued with.">
      <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="busy()"><i class="bi bi-save me-1"></i>Save design</button>
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (f) {
      <div class="row g-3">
        <div class="col-xl-5">
          <ul class="nav nav-pills nav-fill mb-3 small">
            @for (tb of tabs; track tb.key) { <li class="nav-item"><button class="nav-link" [class.active]="tab() === tb.key" (click)="tab.set(tb.key)">{{ tb.label }}</button></li> }
          </ul>

          @switch (tab()) {
            @case ('company') {
              <div class="card"><div class="card-body row g-2">
                <div class="col-12 d-flex align-items-center gap-3">
                  @if (f.company.logo) { <img [src]="f.company.logo" alt="" style="width: 56px; height: 56px; object-fit: contain" class="border rounded" /> }
                  <label class="btn btn-sm btn-outline-secondary mb-0"><i class="bi bi-upload me-1"></i>{{ f.company.logo ? 'Change logo' : 'Upload logo' }}<input type="file" accept="image/*" hidden (change)="upload($event, 'logo')" /></label>
                  @if (f.company.logo) { <button class="btn btn-sm btn-link text-danger" (click)="f.company.logo = ''; touch()">Remove</button> }
                </div>
                <div class="col-12"><label class="form-label small">Company name</label><input class="form-control form-control-sm" [(ngModel)]="f.company.name" (ngModelChange)="touch()" /></div>
                <div class="col-12"><label class="form-label small">Address</label><textarea class="form-control form-control-sm" rows="2" [(ngModel)]="f.company.address" (ngModelChange)="touch()"></textarea></div>
                <div class="col-sm-8"><label class="form-label small">State</label><input class="form-control form-control-sm" [(ngModel)]="f.company.state" (ngModelChange)="touch()" />
                  <div class="form-text">Sellers in this state get CGST + SGST, others IGST.</div></div>
                <div class="col-sm-4"><label class="form-label small">State code</label><input class="form-control form-control-sm" [(ngModel)]="f.company.stateCode" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">GSTIN</label><input class="form-control form-control-sm text-uppercase" [(ngModel)]="f.company.gstin" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">PAN</label><input class="form-control form-control-sm text-uppercase" [(ngModel)]="f.company.pan" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">Phone</label><input class="form-control form-control-sm" [(ngModel)]="f.company.phone" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">Email</label><input class="form-control form-control-sm" [(ngModel)]="f.company.email" (ngModelChange)="touch()" /></div>
                <div class="col-12"><label class="form-label small">Website</label><input class="form-control form-control-sm" [(ngModel)]="f.company.website" (ngModelChange)="touch()" /></div>
                <div class="col-12 mt-3 d-flex justify-content-between align-items-center"><span class="fw-semibold small">Extra company fields (e.g. CIN, MSME no.)</span>
                  <button class="btn btn-sm btn-outline-primary" (click)="f.customFields.push({ label: '', value: '' })"><i class="bi bi-plus-lg"></i></button></div>
                @for (c of f.customFields; track $index) {
                  <div class="col-12 d-flex gap-2">
                    <input class="form-control form-control-sm" placeholder="Label" [(ngModel)]="c.label" (ngModelChange)="touch()" />
                    <input class="form-control form-control-sm" placeholder="Value" [(ngModel)]="c.value" (ngModelChange)="touch()" />
                    <button class="btn btn-sm btn-link text-danger" (click)="f.customFields.splice($index, 1); touch()" aria-label="Remove"><i class="bi bi-x-lg"></i></button>
                  </div>
                }
                <div class="col-12 mt-3 fw-semibold small">Bank details (printed on bills)</div>
                <div class="col-sm-6"><label class="form-label small">Account name</label><input class="form-control form-control-sm" [(ngModel)]="f.bank.accountName" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">Account number</label><input class="form-control form-control-sm" [(ngModel)]="f.bank.accountNumber" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">IFSC</label><input class="form-control form-control-sm text-uppercase" [(ngModel)]="f.bank.ifsc" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">Bank</label><input class="form-control form-control-sm" [(ngModel)]="f.bank.bankName" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">Branch</label><input class="form-control form-control-sm" [(ngModel)]="f.bank.branch" (ngModelChange)="touch()" /></div>
                <div class="col-12"><label class="form-label small">UPI ID</label><input class="form-control form-control-sm" [(ngModel)]="f.bank.upi" (ngModelChange)="touch()" /></div>
              </div></div>
            }
            @case ('layout') {
              <div class="card"><div class="card-body row g-2">
                <div class="col-12"><label class="form-label small">Style</label>
                  <div class="btn-group w-100">
                    @for (s of ['classic', 'modern', 'compact']; track s) { <button class="btn btn-sm text-capitalize" [class]="f.layout.style === s ? 'btn-primary' : 'btn-outline-secondary'" (click)="f.layout.style = s; touch()">{{ s }}</button> }
                  </div></div>
                <div class="col-sm-6"><label class="form-label small">Accent colour</label>
                  <div class="d-flex gap-2"><input type="color" class="form-control form-control-color form-control-sm" [(ngModel)]="f.layout.accentColor" (ngModelChange)="touch()" />
                    <input class="form-control form-control-sm" [(ngModel)]="f.layout.accentColor" (ngModelChange)="touch()" maxlength="7" /></div></div>
                <div class="col-sm-6"><label class="form-label small">Logo position</label>
                  <select class="form-select form-select-sm" [(ngModel)]="f.layout.logoPosition" (ngModelChange)="touch()"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></div>
                <div class="col-sm-6"><label class="form-label small">Font size ({{ f.layout.fontSize }} pt)</label>
                  <input type="range" class="form-range" min="8" max="14" step="1" [(ngModel)]="f.layout.fontSize" (ngModelChange)="touch()" /></div>
                <div class="col-sm-6"><label class="form-label small">Paper (PDF)</label>
                  <select class="form-select form-select-sm" [(ngModel)]="f.layout.paperSize"><option>A4</option><option>Letter</option></select></div>
                <div class="col-12"><label class="form-label small">Bill title</label><input class="form-control form-control-sm" [(ngModel)]="f.title" (ngModelChange)="touch()" placeholder="Tax Invoice" /></div>
                <div class="col-sm-8"><label class="form-label small">Bill number format</label><input class="form-control form-control-sm" [(ngModel)]="f.numberFormat" (ngModelChange)="touch()" />
                  <div class="form-text">Use {{ '{FY}' }} (2026-27), {{ '{YYYY}' }}, {{ '{MM}' }}, {{ '{SEQ}' }}. Next: <b>{{ sample() }}</b></div></div>
                <div class="col-sm-4"><label class="form-label small">Number digits</label><input type="number" min="1" max="8" class="form-control form-control-sm" [(ngModel)]="f.seqPadding" (ngModelChange)="touch()" /></div>
              </div></div>
            }
            @case ('fields') {
              <div class="card mb-3"><div class="card-header"><span class="card-title">Show on bill</span></div><div class="card-body row g-1">
                @for (s of showList; track s.key) {
                  <div class="col-sm-6"><div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" [id]="'sh-' + s.key" [(ngModel)]="f.show[s.key]" (ngModelChange)="touch()" />
                    <label class="form-check-label small" [for]="'sh-' + s.key">{{ s.label }}</label>
                  </div></div>
                }
                <div class="col-12 form-text mt-2">CGST, SGST and IGST rows are always shown only when they have an amount.</div>
              </div></div>
              <div class="card"><div class="card-header"><span class="card-title">Rename labels</span></div><div class="card-body row g-2">
                @for (l of labelList; track l.key) {
                  <div class="col-sm-6"><label class="form-label small text-muted mb-0">{{ l.label }}</label><input class="form-control form-control-sm" [(ngModel)]="f.labels[l.key]" (ngModelChange)="touch()" [placeholder]="l.label" /></div>
                }
              </div></div>
            }
            @case ('text') {
              <div class="card"><div class="card-body row g-2">
                <div class="col-12 fw-semibold small">Defaults for new bills</div>
                <div class="col-12"><label class="form-label small">Plan name</label><input class="form-control form-control-sm" [(ngModel)]="f.defaults.planName" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">HSN / SAC</label><input class="form-control form-control-sm" [(ngModel)]="f.defaults.hsn" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">GST %</label><input type="number" min="0" max="100" class="form-control form-control-sm" [(ngModel)]="f.defaults.taxRate" (ngModelChange)="touch()" /></div>
                <div class="col-sm-4"><label class="form-label small">Due in (days)</label><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="f.defaults.dueInDays" (ngModelChange)="touch()" /></div>
                <div class="col-12"><label class="form-label small">Notes</label><textarea class="form-control form-control-sm" rows="2" [(ngModel)]="f.notes" (ngModelChange)="touch()"></textarea></div>
                <div class="col-12"><label class="form-label small">Terms</label><textarea class="form-control form-control-sm" rows="3" [(ngModel)]="f.terms" (ngModelChange)="touch()"></textarea></div>
                <div class="col-12"><label class="form-label small">Footer</label><input class="form-control form-control-sm" [(ngModel)]="f.footer" (ngModelChange)="touch()" placeholder="e.g. This is a computer generated invoice." /></div>
                <div class="col-12"><label class="form-label small">Signature label</label><input class="form-control form-control-sm" [(ngModel)]="f.signatureLabel" (ngModelChange)="touch()" /></div>
                <div class="col-12 d-flex align-items-center gap-3">
                  @if (signature()) { <img [src]="signature()" alt="" style="max-height: 44px" class="border rounded p-1" /> }
                  <label class="btn btn-sm btn-outline-secondary mb-0"><i class="bi bi-upload me-1"></i>{{ signature() ? 'Change signature' : 'Upload signature' }}<input type="file" accept="image/*" hidden (change)="upload($event, 'signature')" /></label>
                  @if (signature()) { <button class="btn btn-sm btn-link text-danger" (click)="clearSignature()">Remove</button> }
                </div>
              </div></div>
            }
          }
        </div>
        <div class="col-xl-7">
          <div class="sticky-xl-top" style="top: 76px">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small text-muted"><i class="bi bi-eye me-1"></i>Preview with sample data</span>
              <select class="form-select form-select-sm w-auto" [(ngModel)]="sampleMode" (ngModelChange)="touch()">
                <option value="intra">Same state (CGST + SGST)</option><option value="inter">Other state (IGST)</option><option value="none">No GST</option>
              </select>
            </div>
            <app-bill-view [b]="sampleBill()" [t]="previewTemplate()" />
          </div>
        </div>
      </div>
    }
  `,
})
export class BillDesignComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  tab = signal('company');
  signature = signal('');
  private tick = signal(0);
  tabs = [{ key: 'company', label: 'Company' }, { key: 'layout', label: 'Layout' }, { key: 'fields', label: 'Fields' }, { key: 'text', label: 'Text' }];
  showList = SHOW;
  labelList = LABELS;
  sampleMode: 'intra' | 'inter' | 'none' = 'intra';
  f: any = null;

  touch() {
    this.tick.update((n) => n + 1);
  }

  previewTemplate = computed(() => {
    this.tick();
    return this.f ? { ...this.f, layout: { ...this.f.layout }, show: { ...this.f.show }, labels: { ...this.f.labels }, signatureImage: this.signature() } : null;
  });

  sample = computed(() => {
    this.tick();
    return sampleNumber(this.f?.numberFormat || '', Number(this.f?.seqPadding) || 4);
  });

  sampleBill = computed(() => {
    this.tick();
    const d = this.f?.defaults || {};
    const now = new Date();
    const items = [
      { description: d.planName || 'Subscription', hsn: d.hsn, quantity: 1, rate: 999, discount: 0, taxRate: d.taxRate ?? 18 },
      { description: 'Extra customers pack', hsn: d.hsn, quantity: 2, rate: 250, discount: 100, taxRate: d.taxRate ?? 18 },
    ];
    return {
      status: 'Issued', invoiceNumber: this.sample(), invoiceDate: now, dueDate: new Date(now.getTime() + (d.dueInDays ?? 7) * 86400000),
      periodFrom: new Date(now.getFullYear(), now.getMonth(), 1), periodTo: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      placeOfSupply: this.sampleMode === 'inter' ? 'Maharashtra' : this.f?.company?.state, taxMode: this.sampleMode,
      billTo: { name: 'Sample Kirana Store', ownerName: 'Ramesh Kumar', address: '12, Main Market\nIndore 452001', gstin: '23ABCDE1234F1Z5', phone: '9876543210', email: 'shop@example.com' },
      customFields: [{ label: 'PO number', value: 'PO-1024' }],
      notes: this.f?.notes, terms: this.f?.terms,
      ...computeTotals(items, this.sampleMode),
    };
  });

  ngOnInit() {
    this.api.get<any>('/subscription-bills/template').subscribe({
      next: (t) => { this.setForm(t); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private setForm(t: any) {
    const f: any = {};
    KEYS.forEach((k) => (f[k] = t[k] && typeof t[k] === 'object' ? JSON.parse(JSON.stringify(t[k])) : t[k]));
    f.company ??= {}; f.layout ??= {}; f.show ??= {}; f.labels ??= {}; f.bank ??= {}; f.defaults ??= {};
    f.customFields = (f.customFields || []).map((c: any) => ({ label: c.label, value: c.value }));
    this.f = f;
    this.signature.set(t.signatureImage || '');
    this.touch();
  }

  save() {
    if (!/^#[0-9a-fA-F]{6}$/.test(this.f.layout.accentColor || '')) return this.toast.warning('Accent colour must look like #d70f64');
    const body: any = {};
    KEYS.forEach((k) => (body[k] = this.f[k]));
    body.customFields = this.f.customFields.filter((c: any) => c.label?.trim());
    body.seqPadding = Number(body.seqPadding) || 4;
    body.layout = { ...body.layout, fontSize: Number(body.layout.fontSize) || 10 };
    body.defaults = { ...body.defaults, taxRate: Number(body.defaults.taxRate) || 0, dueInDays: Number(body.defaults.dueInDays) || 0 };
    body.signatureImage = this.signature();
    this.busy.set(true);
    this.api.put<any>('/subscription-bills/template', body).subscribe({
      next: (r) => { this.busy.set(false); this.setForm(r.data); this.toast.success(r.message || 'Bill design saved'); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  upload(ev: Event, kind: 'logo' | 'signature') {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return this.toast.warning('Image must be under 2 MB');
    const fd = new FormData();
    fd.append('image', file);
    this.api.post<any>(`/subscription-bills/template/image?kind=${kind}`, fd).subscribe({
      next: (r) => {
        if (kind === 'logo') this.f.company.logo = r.data.company?.logo || '';
        else this.signature.set(r.data.signatureImage || '');
        this.touch();
        this.toast.success('Image uploaded');
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  clearSignature() {
    this.signature.set('');
    this.touch();
  }
}
