const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    hsn: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    // computed
    taxableValue: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    amount: Number, // taxable value + tax
  },
  { _id: false }
);

const party = {
  name: String,
  ownerName: String,
  address: String,
  state: String,
  gstin: String,
  phone: String,
  email: String,
};

/**
 * Subscription bill the platform raises on a seller (created manually by an admin).
 * Draft -> Issued (gets its number, template is frozen) -> Paid / Cancelled.
 */
const subscriptionInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true, sparse: true }, // given when issued
    status: { type: String, enum: ['Draft', 'Issued', 'Paid', 'Cancelled'], default: 'Draft', index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    billTo: party, // seller details printed on the bill (editable)
    planName: String,
    periodFrom: Date,
    periodTo: Date,
    invoiceDate: { type: Date, default: Date.now },
    dueDate: Date,
    // intra = CGST + SGST (same state), inter = IGST (other state), none = no GST
    taxMode: { type: String, enum: ['intra', 'inter', 'none'], default: 'intra' },
    placeOfSupply: String,
    items: { type: [itemSchema], default: [] },
    subtotal: Number,
    discountTotal: Number,
    cgstTotal: Number,
    sgstTotal: Number,
    igstTotal: Number,
    roundOff: Number,
    total: Number,
    amountInWords: String,
    notes: String,
    terms: String,
    customFields: [{ label: String, value: String, _id: false }],
    // Copy of the bill design at the moment of issue, so later design changes do not alter it
    templateSnapshot: { type: mongoose.Schema.Types.Mixed },
    issuedAt: Date,
    paidAt: Date,
    paymentMethod: String,
    paymentRef: String,
    cancelledAt: Date,
    cancelReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

subscriptionInvoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
