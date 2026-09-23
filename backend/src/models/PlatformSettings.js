const mongoose = require('mongoose');

// Singleton document holding platform wide configuration.
const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    platformName: { type: String, default: 'PrimeNear' },
    platformLogo: String,
    platformDescription: String,
    website: String,
    supportEmail: String,
    supportPhone: String,
    supportHours: {
      startTime: { type: String, default: '09:00' },
      endTime: { type: String, default: '18:00' },
      timezone: { type: String, default: 'Asia/Kolkata' },
    },
    commissionSettings: {
      defaultCommission: { type: Number, default: 5 },
      commissionType: { type: String, enum: ['Percentage', 'Fixed'], default: 'Percentage' },
      payoutFrequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly'], default: 'Weekly' },
      // Online orders become eligible for payout this many days after delivery
      payoutDelayDays: { type: Number, default: 7 },
      // When true, commission on cash (POS / COD) orders is deducted from the next payout
      chargeCommissionOnCash: { type: Boolean, default: false },
    },
    gstSettings: {
      slabs: {
        type: [{ percentage: Number, description: String, _id: false }],
        default: [
          { percentage: 0, description: 'Exempt' },
          { percentage: 5, description: 'GST 5%' },
          { percentage: 12, description: 'GST 12%' },
          { percentage: 18, description: 'GST 18%' },
          { percentage: 28, description: 'GST 28%' },
        ],
      },
    },
    paymentSettings: {
      enableCashPayment: { type: Boolean, default: true },
      enableOnlinePayment: { type: Boolean, default: true },
    },
    deliverySettings: {
      enableDelivery: { type: Boolean, default: true },
      defaultDeliveryCharge: { type: Number, default: 0 },
      freeDeliveryAbove: { type: Number, default: 1000 },
      deliveryPartners: [String],
    },
    notificationSettings: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: true },
      whatsappNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
    },
    securitySettings: {
      enableTwoFactor: { type: Boolean, default: false }, // required for every admin when true
      sessionTimeout: { type: Number, default: 30 }, // minutes of inactivity
      maxLoginAttempts: { type: Number, default: 5 },
      lockMinutes: { type: Number, default: 15 },
      passwordExpiryDays: { type: Number, default: 0 }, // 0 = never
    },
    lowStockThreshold: { type: Number, default: 5 },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

platformSettingsSchema.statics.getSettings = async function getSettings() {
  let settings = await this.findOne({ key: 'platform' });
  if (!settings) settings = await this.create({ key: 'platform' });
  return settings;
};

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
