const mongoose = require('mongoose');

const round2 = (n) => Math.round(n * 100) / 100;

const productSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' },
    description: String,
    images: [String],
    videos: [String],
    mrp: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    // Must be one of the GST slabs configured in platform settings
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    gstAmount: Number,
    finalPrice: Number, // sellingPrice + GST (auto)
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    sku: { type: String, trim: true },
    barcode: String,
    isActive: { type: Boolean, default: true },
    // Set when an admin disables the product; seller cannot re-enable it.
    disabledByAdmin: { type: Boolean, default: false },
    adminNote: String,
    isDeleted: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ sellerId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
productSchema.index({ name: 'text', description: 'text' });

productSchema.pre('save', function computePrice() {
  if (this.isModified('sellingPrice') || this.isModified('gstRate') || this.isNew) {
    this.gstAmount = round2((this.sellingPrice * (this.gstRate || 0)) / 100);
    this.finalPrice = round2(this.sellingPrice + this.gstAmount);
  }
});

productSchema.statics.computePrice = (sellingPrice, gstRate = 0) => {
  const gstAmount = round2((sellingPrice * gstRate) / 100);
  return { gstAmount, finalPrice: round2(sellingPrice + gstAmount) };
};

module.exports = mongoose.model('Product', productSchema);
