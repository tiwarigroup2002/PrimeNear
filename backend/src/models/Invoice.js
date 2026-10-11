const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: { name: String, mobileNumber: String },
    // Bill-to address (online orders)
    billingAddress: { name: String, fullAddress: String, city: String, taluka: String, district: String, state: String, zipCode: String, phoneNumber: String },
    items: [
      {
        productId: mongoose.Schema.Types.ObjectId,
        variantId: mongoose.Schema.Types.ObjectId,
        variantLabel: String,
        productName: String,
        quantity: Number,
        price: Number,
        gstRate: Number,
        gst: Number,
        subtotal: Number,
        _id: false,
      },
    ],
    subtotal: Number,
    totalGst: Number,
    deliveryCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: Number,
    paymentMethod: { type: String, enum: ['Online', 'Cash'] },
    invoiceDate: { type: Date, default: Date.now },
    notes: String,
    sharedVia: [{ channel: String, at: Date, _id: false }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
