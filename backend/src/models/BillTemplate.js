const mongoose = require('mongoose');

const kv = new mongoose.Schema({ label: { type: String, trim: true }, value: { type: String, trim: true } }, { _id: false });

/**
 * Design of the subscription bills the platform sends to sellers.
 * One document (key "default"). Everything printed on the bill comes from here:
 * company details, numbering, layout / colours, which fields are shown, labels,
 * bank details, terms and extra fields.
 */
const billTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    company: {
      name: { type: String, default: 'PrimeNear' },
      address: { type: String, default: '' },
      state: { type: String, default: 'Madhya Pradesh' },
      stateCode: { type: String, default: '23' },
      gstin: { type: String, default: '' },
      pan: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      website: { type: String, default: '' },
      logo: { type: String, default: '' },
    },
    title: { type: String, default: 'Tax Invoice' },
    // Tokens: {FY} financial year (2026-27), {YYYY}, {MM}, {SEQ} running number
    numberFormat: { type: String, default: 'PN/{FY}/{SEQ}' },
    seqPadding: { type: Number, default: 4, min: 1, max: 8 },
    layout: {
      style: { type: String, enum: ['classic', 'modern', 'compact'], default: 'classic' },
      accentColor: { type: String, default: '#d70f64' },
      logoPosition: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
      fontSize: { type: Number, default: 10, min: 8, max: 14 },
      paperSize: { type: String, enum: ['A4', 'Letter'], default: 'A4' },
    },
    // Which blocks / columns are printed
    show: {
      logo: { type: Boolean, default: true },
      companyGstin: { type: Boolean, default: true },
      companyPan: { type: Boolean, default: false },
      companyContact: { type: Boolean, default: true },
      sellerGstin: { type: Boolean, default: true },
      sellerContact: { type: Boolean, default: true },
      placeOfSupply: { type: Boolean, default: true },
      dueDate: { type: Boolean, default: true },
      period: { type: Boolean, default: true },
      hsn: { type: Boolean, default: true },
      quantity: { type: Boolean, default: true },
      discount: { type: Boolean, default: false },
      taxRateColumn: { type: Boolean, default: false },
      amountInWords: { type: Boolean, default: true },
      bankDetails: { type: Boolean, default: true },
      notes: { type: Boolean, default: true },
      terms: { type: Boolean, default: true },
      signature: { type: Boolean, default: true },
      paidStamp: { type: Boolean, default: true },
    },
    labels: {
      billTo: { type: String, default: 'Bill to' },
      invoiceNo: { type: String, default: 'Invoice no.' },
      invoiceDate: { type: String, default: 'Invoice date' },
      dueDate: { type: String, default: 'Due date' },
      period: { type: String, default: 'Subscription period' },
      description: { type: String, default: 'Description' },
      hsn: { type: String, default: 'HSN/SAC' },
      quantity: { type: String, default: 'Qty' },
      rate: { type: String, default: 'Rate' },
      discount: { type: String, default: 'Discount' },
      amount: { type: String, default: 'Amount' },
      subtotal: { type: String, default: 'Taxable value' },
      total: { type: String, default: 'Total' },
    },
    bank: {
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      bankName: { type: String, default: '' },
      branch: { type: String, default: '' },
      upi: { type: String, default: '' },
    },
    // Extra lines printed under the company details (e.g. CIN, FSSAI)
    customFields: { type: [kv], default: [] },
    defaults: {
      planName: { type: String, default: 'PrimeNear seller subscription' },
      hsn: { type: String, default: '998314' },
      taxRate: { type: Number, default: 18, min: 0, max: 100 },
      dueInDays: { type: Number, default: 7, min: 0, max: 365 },
    },
    notes: { type: String, default: 'Thank you for being a PrimeNear partner.' },
    terms: { type: String, default: 'Payment is due by the due date. This is a computer generated invoice.' },
    footer: { type: String, default: '' },
    signatureLabel: { type: String, default: 'Authorised signatory' },
    signatureImage: { type: String, default: '' },
  },
  { timestamps: true }
);

billTemplateSchema.statics.getDefault = async function getDefault() {
  return this.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, returnDocument: 'after' });
};

module.exports = mongoose.model('BillTemplate', billTemplateSchema);
