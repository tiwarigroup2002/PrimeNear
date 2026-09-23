const QRCode = require('qrcode');
const { authenticator } = require('otplib');

// Accept codes from the previous/next 30s window to tolerate clock drift
authenticator.options = { window: 1 };
const verifyTotp = (secret, token) => authenticator.verify({ secret, token });
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { randomToken, sha256 } = require('../../utils/crypto');
const { sendMail } = require('../../utils/mailer');
const { Admin, LoginHistory } = require('../../models');
const { signAdminToken } = require('../../middleware/adminAuth');
const { effectivePermissions } = require('../../config/permissions');
const { getSettings } = require('../../services/settings.service');
const { audit } = require('../../services/audit.service');
const { fileUrl } = require('../../middleware/upload');

function adminPayload(admin) {
  return {
    id: admin._id,
    email: admin.email,
    fullName: admin.fullName,
    mobileNumber: admin.mobileNumber,
    profileImage: admin.profileImage,
    role: admin.role,
    permissions: effectivePermissions(admin),
    twoFactorEnabled: admin.twoFactorEnabled,
    lastLogin: admin.lastLogin,
  };
}

async function recordLogin(req, admin, status, reason) {
  await LoginHistory.create({
    principalType: 'Admin',
    principalId: admin?._id,
    identifier: req.body.email,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status,
    reason,
  });
}

async function completeLogin(req, admin) {
  const settings = await getSettings();
  admin.loginAttempts = 0;
  admin.lockUntil = undefined;
  admin.lastLogin = new Date();
  await admin.save();
  await recordLogin(req, admin, 'Success');

  const expiryDays = settings.securitySettings.passwordExpiryDays;
  const changedAt = admin.passwordChangedAt || admin.createdAt;
  const passwordExpired = expiryDays > 0 && changedAt && Date.now() - changedAt.getTime() > expiryDays * 86400000;

  return {
    token: signAdminToken(admin),
    admin: adminPayload(admin),
    mustSetup2fa: settings.securitySettings.enableTwoFactor && !admin.twoFactorEnabled,
    passwordExpired,
  };
}

/** POST /auth/login */
async function login(req, res) {
  const { email, password } = req.body;
  const settings = await getSettings();
  const { maxLoginAttempts, lockMinutes } = settings.securitySettings;

  const admin = await Admin.findOne({ email: email.toLowerCase(), isDeleted: false }).select('+password +twoFactorSecret');
  if (!admin) {
    await recordLogin(req, null, 'Failed', 'Unknown email');
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (admin.lockUntil && admin.lockUntil > new Date()) {
    await recordLogin(req, admin, 'Locked', 'Account locked');
    const mins = Math.ceil((admin.lockUntil - Date.now()) / 60000);
    throw new ApiError(423, `Too many failed attempts. Try again in ${mins} minute(s).`);
  }
  if (!admin.isActive) {
    await recordLogin(req, admin, 'Failed', 'Inactive account');
    throw ApiError.forbidden('Your account has been deactivated. Contact the super admin.');
  }

  const valid = await admin.comparePassword(password);
  if (!valid) {
    admin.loginAttempts = (admin.loginAttempts || 0) + 1;
    admin.lastLoginAttempt = new Date();
    if (admin.loginAttempts >= maxLoginAttempts) {
      admin.lockUntil = new Date(Date.now() + lockMinutes * 60000);
      admin.loginAttempts = 0;
    }
    await admin.save();
    await recordLogin(req, admin, 'Failed', 'Wrong password');
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (admin.twoFactorEnabled) {
    return ok(res, { requires2fa: true, tempToken: signAdminToken(admin, { twoFactorPending: true }) });
  }
  return ok(res, await completeLogin(req, admin), 'Login successful');
}

/** POST /auth/verify-2fa (uses the temporary token returned by login) */
async function verify2fa(req, res) {
  const admin = await Admin.findById(req.admin._id).select('+twoFactorSecret');
  if (!verifyTotp(admin.twoFactorSecret, req.body.code)) {
    await recordLogin(req, admin, 'Failed', 'Invalid 2FA code');
    throw ApiError.unauthorized('Invalid verification code');
  }
  return ok(res, await completeLogin(req, admin), 'Login successful');
}

/** POST /auth/logout - invalidates every token issued to this admin */
async function logout(req, res) {
  req.admin.tokenVersion = (req.admin.tokenVersion || 0) + 1;
  await req.admin.save();
  await LoginHistory.findOneAndUpdate(
    { principalType: 'Admin', principalId: req.admin._id, status: 'Success', logoutTime: null },
    { logoutTime: new Date() },
    { sort: { loginTime: -1 } }
  );
  return ok(res, null, 'Logged out successfully');
}

/** GET /auth/me */
async function me(req, res) {
  return ok(res, adminPayload(req.admin));
}

/** PUT /auth/profile */
async function updateProfile(req, res) {
  const before = req.admin.toJSON();
  Object.assign(req.admin, req.body);
  await req.admin.save();
  await audit(req, { action: 'Updated', entityType: 'AdminProfile', entityId: req.admin._id, oldValue: before, newValue: req.admin });
  return ok(res, adminPayload(req.admin), 'Profile updated');
}

/** POST /auth/profile/image */
async function uploadProfileImage(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose an image');
  req.admin.profileImage = fileUrl('admins', req.file.filename);
  await req.admin.save();
  return ok(res, { profileImage: req.admin.profileImage }, 'Profile image updated');
}

/** PUT /auth/change-password */
async function changePassword(req, res) {
  const admin = await Admin.findById(req.admin._id).select('+password');
  if (!(await admin.comparePassword(req.body.currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  if (req.body.currentPassword === req.body.newPassword) throw ApiError.badRequest('New password must be different');
  admin.password = req.body.newPassword;
  admin.tokenVersion += 1; // log out other sessions
  await admin.save();
  await audit(req, { action: 'PasswordChanged', entityType: 'Admin', entityId: admin._id });
  return ok(res, { token: signAdminToken(admin) }, 'Password changed successfully');
}

/** POST /auth/forgot-password - always answers the same to avoid email enumeration */
async function forgotPassword(req, res) {
  const admin = await Admin.findOne({ email: req.body.email.toLowerCase(), isDeleted: false, isActive: true });
  if (admin) {
    const token = randomToken(32);
    admin.passwordResetToken = sha256(token);
    admin.passwordResetExpires = new Date(Date.now() + 30 * 60000);
    await admin.save();
    const link = `${config.adminPanelUrl}/auth/reset-password?token=${token}`;
    await sendMail({
      to: admin.email,
      subject: 'Reset your PrimeNear admin password',
      text: `Hello ${admin.fullName},\n\nUse this link to reset your password (valid for 30 minutes):\n${link}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Hello ${admin.fullName},</p><p>Use this link to reset your password (valid for 30 minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, ignore this email.</p>`,
    });
  }
  return ok(res, null, 'If this email is registered, a reset link has been sent');
}

/** POST /auth/reset-password */
async function resetPassword(req, res) {
  const admin = await Admin.findOne({
    passwordResetToken: sha256(req.body.token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');
  if (!admin) throw ApiError.badRequest('Reset link is invalid or has expired');
  admin.password = req.body.newPassword;
  admin.passwordResetToken = undefined;
  admin.passwordResetExpires = undefined;
  admin.loginAttempts = 0;
  admin.lockUntil = undefined;
  admin.tokenVersion += 1;
  await admin.save();
  return ok(res, null, 'Password reset successfully. Please login.');
}

/** POST /auth/2fa/setup - creates a new secret (not active until confirmed) */
async function setup2fa(req, res) {
  const admin = await Admin.findById(req.admin._id).select('+twoFactorSecret');
  if (admin.twoFactorEnabled) throw ApiError.badRequest('Two-factor authentication is already enabled');
  const settings = await getSettings();
  const secret = authenticator.generateSecret();
  admin.twoFactorSecret = secret;
  await admin.save();
  const otpauthUrl = authenticator.keyuri(admin.email, `${settings.platformName} Admin`, secret);
  const qrCode = await QRCode.toDataURL(otpauthUrl);
  return ok(res, { secret, otpauthUrl, qrCode });
}

/** POST /auth/2fa/enable */
async function enable2fa(req, res) {
  const admin = await Admin.findById(req.admin._id).select('+twoFactorSecret');
  if (!admin.twoFactorSecret) throw ApiError.badRequest('Start the 2FA setup first');
  if (!verifyTotp(admin.twoFactorSecret, req.body.code)) throw ApiError.badRequest('Invalid verification code');
  admin.twoFactorEnabled = true;
  await admin.save();
  await audit(req, { action: 'Enabled2FA', entityType: 'Admin', entityId: admin._id });
  return ok(res, adminPayload(admin), 'Two-factor authentication enabled');
}

/** POST /auth/2fa/disable */
async function disable2fa(req, res) {
  const settings = await getSettings();
  if (settings.securitySettings.enableTwoFactor) throw ApiError.badRequest('2FA is mandatory on this platform');
  const admin = await Admin.findById(req.admin._id).select('+password +twoFactorSecret');
  if (!(await admin.comparePassword(req.body.password))) throw ApiError.badRequest('Password is incorrect');
  admin.twoFactorEnabled = false;
  admin.twoFactorSecret = undefined;
  await admin.save();
  await audit(req, { action: 'Disabled2FA', entityType: 'Admin', entityId: admin._id });
  return ok(res, adminPayload(admin), 'Two-factor authentication disabled');
}

/** GET /public-config - branding & session settings needed before login */
async function publicConfig(_req, res) {
  const s = await getSettings();
  return ok(res, {
    platformName: s.platformName,
    platformLogo: s.platformLogo,
    supportEmail: s.supportEmail,
    sessionTimeout: s.securitySettings.sessionTimeout,
  });
}

module.exports = {
  login,
  verify2fa,
  logout,
  me,
  updateProfile,
  uploadProfileImage,
  changePassword,
  forgotPassword,
  resetPassword,
  setup2fa,
  enable2fa,
  disable2fa,
  publicConfig,
};
