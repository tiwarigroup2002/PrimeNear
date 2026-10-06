const mongoose = require('mongoose');

const subCategorySchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    icon: String,
    isActive: { type: Boolean, default: true },
    // Set when a seller added it from the seller app (shared with every shop)
    createdBySellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  },
  { timestamps: true }
);

subCategorySchema.index({ categoryId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SubCategory', subCategorySchema);
