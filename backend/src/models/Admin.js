const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ADMIN_ROLES } = require('./constants');

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, trim: true },
    profileImage: String,
    role: { type: String, enum: ADMIN_ROLES, default: 'Admin' },
    // Extra permissions on top of the role defaults (see config/permissions)
    permissions: [String],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lastLoginAttempt: Date,
    lockUntil: Date,
    passwordChangedAt: Date,
    // Incremented on logout / password change so old JWTs stop working
    tokenVersion: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

adminSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

adminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.twoFactorSecret;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Admin', adminSchema);
