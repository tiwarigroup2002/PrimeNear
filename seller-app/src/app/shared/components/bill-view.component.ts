import { Component, Input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

/**
 * Prints a subscription bill using the bill design (template): company block, layout style,
 * colours, visible fields and labels. CGST / SGST / IGST rows appear only when they have a value.
 * The same component is used for the live preview, the bill page and printing.
 */
@Component({
  selector: 'app-bill-view',
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (t && b) {
      <div class="bill" [class.modern]="t.layout?.style === 'modern'" [class.compact]="t.layout?.style === 'compact'" [style.--accent]="t.layout?.accentColor || '#d70f64'" [style.font-size.px]="(t.layout?.fontSize || 10) + 3">
        @if (b.status === 'Draft') { <div class="ribbon draft">DRAFT</div> }
        @if (b.status === 'Cancelled') { <div class="ribbon cancelled">CANCELLED</div> }
        @if (b.status === 'Paid' && s.paidStamp) { <div class="ribbon paid">PAID</div> }

        <header class="bill-head" [class.center]="t.layout?.logoPosition === 'center'" [class.right]="t.layout?.logoPosition === 'right'">
          @if (s.logo && t.company?.logo) { <img [src]="t.company.logo" class="bill-logo" alt="" /> }
          <div class="company">
            <div class="company-name">{{ t.company?.name }}</div>
            @if (t.company?.address) { <div class="pre">{{ t.company.address }}</div> }
            @if (s.companyContact && contact()) { <div>{{ contact() }}</div> }
            <div>
              @if (s.companyGstin && t.company?.gstin) { <span class="me-3">GSTIN: <b>{{ t.company.gstin }}</b></span> }
              @if (s.companyPan && t.company?.pan) { <span class="me-3">PAN: {{ t.company.pan }}</span> }
              @for (f of t.customFields || []; track $index) { @if (f.label && f.value) { <span class="me-3">{{ f.label }}: {{ f.value }}</span> } }
            </div>
          </div>
        </header>

        <div class="bill-title">{{ t.title || 'Tax Invoice' }}</div>

        <section class="parties">
          <div>
            <div class="label">{{ L.billTo || 'Bill to' }}</div>
            <div class="fw-bold">{{ b.billTo?.name }}</div>
            @if (b.billTo?.ownerName) { <div>{{ b.billTo.ownerName }}</div> }
            @if (b.billTo?.address) { <div class="pre">{{ b.billTo.address }}</div> }
            @if (s.sellerGstin && b.billTo?.gstin) { <div>GSTIN: <b>{{ b.billTo.gstin }}</b></div> }
            @if (s.sellerContact && (b.billTo?.phone || b.billTo?.email)) { <div>{{ [b.billTo.phone, b.billTo.email].filter(isSet).join(' | ') }}</div> }
          </div>
          <table class="meta">
            <tr><th>{{ L.invoiceNo || 'Invoice no.' }}</th><td>{{ b.invoiceNumber || 'Will be given on issue' }}</td></tr>
            <tr><th>{{ L.invoiceDate || 'Invoice date' }}</th><td>{{ b.invoiceDate | date: 'dd MMM y' }}</td></tr>
            @if (s.dueDate && b.dueDate) { <tr><th>{{ L.dueDate || 'Due date' }}</th><td>{{ b.dueDate | date: 'dd MMM y' }}</td></tr> }
            @if (s.period && (b.periodFrom || b.periodTo)) { <tr><th>{{ L.period || 'Period' }}</th><td>{{ b.periodFrom | date: 'dd MMM y' }} – {{ b.periodTo | date: 'dd MMM y' }}</td></tr> }
            @if (s.placeOfSupply && b.placeOfSupply) { <tr><th>Place of supply</th><td>{{ b.placeOfSupply }}</td></tr> }
            @for (f of b.customFields || []; track $index) { @if (f.label && f.value) { <tr><th>{{ f.label }}</th><td>{{ f.value }}</td></tr> } }
          </table>
        </section>

        <div class="items-wrap"><table class="items">
          <thead>
            <tr>
              <th style="width: 28px">#</th>
              <th>{{ L.description || 'Description' }}</th>
              @if (s.hsn) { <th>{{ L.hsn || 'HSN/SAC' }}</th> }
              @if (s.quantity) { <th class="num">{{ L.quantity || 'Qty' }}</th> }
              <th class="num">{{ L.rate || 'Rate' }}</th>
              @if (s.discount) { <th class="num">{{ L.discount || 'Discount' }}</th> }
              @if (s.taxRateColumn && b.taxMode !== 'none') { <th class="num">GST %</th> }
              <th class="num">{{ L.amount || 'Amount' }}</th>
            </tr>
          </thead>
          <tbody>
            @for (it of b.items || []; track $index) {
              <tr>
                <td>{{ $index + 1 }}</td>
                <td>{{ it.description }}</td>
                @if (s.hsn) { <td>{{ it.hsn }}</td> }
                @if (s.quantity) { <td class="num">{{ it.quantity }}</td> }
                <td class="num">₹{{ it.rate | number: '1.2-2' }}</td>
                @if (s.discount) { <td class="num">{{ it.discount ? '₹' + (it.discount | number: '1.2-2') : '–' }}</td> }
                @if (s.taxRateColumn && b.taxMode !== 'none') { <td class="num">{{ it.taxRate }}%</td> }
                <td class="num">₹{{ it.taxableValue | number: '1.2-2' }}</td>
              </tr>
            } @empty { <tr><td [attr.colspan]="8" class="text-center text-muted">No lines yet</td></tr> }
          </tbody>
        </table></div>

        <div class="bottom">
          <div class="words">
            @if (s.amountInWords && b.amountInWords) { <div><span class="label">Amount in words</span><br /><i>{{ b.amountInWords }}</i></div> }
            @if (s.bankDetails && (t.bank?.accountNumber || t.bank?.upi)) {
              <div class="mt-2"><span class="label">Bank details</span>
                @if (t.bank.accountName) { <div>Account name: {{ t.bank.accountName }}</div> }
                @if (t.bank.accountNumber) { <div>Account no.: {{ t.bank.accountNumber }}</div> }
                @if (t.bank.ifsc) { <div>IFSC: {{ t.bank.ifsc }}</div> }
                @if (t.bank.bankName || t.bank.branch) { <div>{{ [t.bank.bankName, t.bank.branch].filter(isSet).join(', ') }}</div> }
                @if (t.bank.upi) { <div>UPI: {{ t.bank.upi }}</div> }
              </div>
            }
          </div>
          <table class="totals">
            <tr><th>{{ L.subtotal || 'Taxable value' }}</th><td>₹{{ b.subtotal | number: '1.2-2' }}</td></tr>
            <!-- Tax rows only when they have a value -->
            @if (b.cgstTotal > 0) { <tr><th>CGST{{ rateLabel('cgst') }}</th><td>₹{{ b.cgstTotal | number: '1.2-2' }}</td></tr> }
            @if (b.sgstTotal > 0) { <tr><th>SGST{{ rateLabel('sgst') }}</th><td>₹{{ b.sgstTotal | number: '1.2-2' }}</td></tr> }
            @if (b.igstTotal > 0) { <tr><th>IGST{{ rateLabel('igst') }}</th><td>₹{{ b.igstTotal | number: '1.2-2' }}</td></tr> }
            @if (b.roundOff) { <tr><th>Round off</th><td>{{ b.roundOff > 0 ? '+' : '' }}₹{{ b.roundOff | number: '1.2-2' }}</td></tr> }
            <tr class="grand"><th>{{ L.total || 'Total' }}</th><td>₹{{ b.total | number: '1.2-2' }}</td></tr>
          </table>
        </div>

        @if (s.notes && b.notes) { <div class="block"><span class="label">Notes</span><div class="pre">{{ b.notes }}</div></div> }
        @if (s.terms && b.terms) { <div class="block"><span class="label">Terms</span><div class="pre">{{ b.terms }}</div></div> }
        @if (s.signature) {
          <div class="sign">
            @if (t.signatureImage) { <img [src]="t.signatureImage" alt="" /> }
            <div>For {{ t.company?.name }}</div>
            <div class="label">{{ t.signatureLabel || 'Authorised signatory' }}</div>
          </div>
        }
        @if (t.footer) { <div class="footer">{{ t.footer }}</div> }
      </div>
    }
  `,
  styles: [`
    .bill { --accent: #d70f64; position: relative; background: #fff; color: #222; padding: 28px; border: 1px solid #e5e7eb; border-radius: 6px; line-height: 1.45; overflow: hidden; }
    .bill.compact { padding: 16px; line-height: 1.3; }
    .bill.modern { border-top: 8px solid var(--accent); }
    .ribbon { position: absolute; top: 18px; right: -42px; transform: rotate(35deg); width: 170px; text-align: center; font-weight: 700; font-size: 12px; letter-spacing: .1em; color: #fff; padding: 3px 0; }
    .ribbon.draft { background: #d97706; } .ribbon.cancelled { background: #b91c1c; } .ribbon.paid { background: #15803d; }
    .bill-head { display: flex; gap: 14px; align-items: flex-start; }
    .bill-head.right { flex-direction: row-reverse; text-align: right; }
    .bill-head.center { flex-direction: column; align-items: center; text-align: center; }
    .bill-logo { width: 64px; height: 64px; object-fit: contain; }
    .company { font-size: .88em; color: #444; }
    .company-name { font-size: 1.6em; font-weight: 700; color: var(--accent); line-height: 1.2; }
    .bill-title { text-align: center; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-size: 1.15em; margin: 14px 0 10px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 6px 0; }
    .modern .bill-title { text-align: right; border: 0; font-size: 1.5em; }
    .parties { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 14px; font-size: .92em; }
    .label { font-size: .78em; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; }
    .meta th { padding: 1px 12px 1px 0; color: #6b7280; font-weight: 600; white-space: nowrap; }
    .meta td { padding: 1px 0; text-align: right; }
    .items-wrap { overflow-x: auto; }
    .items { width: 100%; min-width: 420px; border-collapse: collapse; font-size: .92em; }
    .items th { background: #f1f5f9; text-align: left; padding: 7px 8px; font-weight: 600; }
    .modern .items th { background: var(--accent); color: #fff; }
    .items td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .compact .items th, .compact .items td { padding: 4px 6px; }
    .num { text-align: right; white-space: nowrap; }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin-top: 12px; font-size: .9em; }
    .words { flex: 1; }
    .totals { min-width: 260px; }
    .totals th { font-weight: 500; padding: 2px 12px 2px 0; }
    .totals td { text-align: right; padding: 2px 0; }
    .totals .grand th, .totals .grand td { border-top: 2px solid var(--accent); font-weight: 700; font-size: 1.1em; padding-top: 6px; }
    .block { margin-top: 12px; font-size: .88em; }
    .pre { white-space: pre-line; }
    .sign { margin-top: 24px; text-align: right; font-size: .88em; }
    .sign img { max-width: 140px; max-height: 50px; display: block; margin-left: auto; }
    .footer { margin-top: 18px; text-align: center; font-size: .8em; color: #6b7280; }
    @media (max-width: 576px) { .bill { padding: 14px; } .parties, .bottom { flex-direction: column; } .totals { min-width: 0; width: 100%; } }
  `],
})
export class BillViewComponent {
  /** Bill data (items with computed totals) */
  @Input() b: any;
  /** Bill design (template) */
  @Input() t: any;

  get s() { return this.t?.show || {}; }
  get L() { return this.t?.labels || {}; }

  isSet = (v: any) => !!v;

  contact() {
    return [this.t?.company?.phone, this.t?.company?.email, this.t?.company?.website].filter(Boolean).join('  |  ');
  }

  /** " @ 9%" when every taxed line uses the same rate */
  rateLabel(kind: 'cgst' | 'sgst' | 'igst') {
    const rates = [...new Set((this.b?.items || []).filter((it: any) => it[kind] > 0).map((it: any) => (kind === 'igst' ? it.taxRate : it.taxRate / 2)))];
    return rates.length === 1 ? ` @ ${rates[0]}%` : '';
  }
}
