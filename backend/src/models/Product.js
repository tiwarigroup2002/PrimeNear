const mongoose = require('mongoose');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * One colour / size combination of a product, with its own price, stock and photos.
 * Stock of the product is always the sum of its variants' stock.
 */
const variantSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  size: { type: String, trim: true, default: '' },
  sku: { type: String, trim: true },
  mrp: { type: Number, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  gstAmount: Number,
  finalPrice: Number,
  stock: { type: Number, default: 0, min: 0 },
  images: [String],
  isActive: { type: Boolean, default: true },
});

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
    // Colour / size combinations. Empty for simple products.
    variants: { type: [variantSchema], default: [] },
  },
  { timestamps: true }
);

const label = (v) => [v.color, v.size].filter(Boolean).join(' / ');

productSchema.index({ sellerId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
productSchema.index({ name: 'text', description: 'text' });

productSchema.pre('save', function computePrice() {
  const rate = this.gstRate || 0;
  if (this.variants?.length) {
    // Every variant gets its GST price; the product shows the cheapest active variant ("from ₹…")
    // and its stock is the total of all variants.
    for (const v of this.variants) {
      v.gstAmount = round2((v.sellingPrice * rate) / 100);
      v.finalPrice = round2(v.sellingPrice + v.gstAmount);
    }
    const active = this.variants.filter((v) => v.isActive);
    const cheapest = [...(active.length ? active : this.variants)].sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
    this.sellingPrice = cheapest.sellingPrice;
    this.mrp = cheapest.mrp;
    this.stock = this.variants.reduce((s, v) => s + (v.stock || 0), 0);
  }
  if (this.isModified('sellingPrice') || this.isModified('gstRate') || this.isModified('variants') || this.isNew) {
    this.gstAmount = round2((this.sellingPrice * rate) / 100);
    this.finalPrice = round2(this.sellingPrice + this.gstAmount);
  }
});

productSchema.virtual('hasVariants').get(function hasVariants() {
  return (this.variants?.length || 0) > 0;
});

/**
 * Sellable unit of the product: the variant with `variantId`, or the product itself
 * when it has no variants. Returns null when the variant is missing.
 */
productSchema.methods.unit = function unit(variantId) {
  if (!this.variants?.length) {
    return { variantId: null, variantLabel: '', sellingPrice: this.sellingPrice, mrp: this.mrp, gstAmount: this.gstAmount, finalPrice: this.finalPrice, stock: this.stock, image: this.images?.[0], isActive: this.isActive, sku: this.sku };
  }
  const v = variantId && this.variants.id(variantId);
  if (!v) return null;
  return { variantId: v._id, variantLabel: label(v), sellingPrice: v.sellingPrice, mrp: v.mrp, gstAmount: v.gstAmount, finalPrice: v.finalPrice, stock: v.stock, image: v.images?.[0] || this.images?.[0], isActive: this.isActive && v.isActive, sku: v.sku || this.sku };
};

productSchema.statics.variantLabel = label;

productSchema.statics.computePrice = (sellingPrice, gstRate = 0) => {
  const gstAmount = round2((sellingPrice * gstRate) / 100);
  return { gstAmount, finalPrice: round2(sellingPrice + gstAmount) };
};

module.exports = mongoose.model('Product', productSchema);
