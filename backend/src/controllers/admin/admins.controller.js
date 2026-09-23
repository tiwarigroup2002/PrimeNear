const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex } = require('../../utils/pagination');
const { Admin } = require('../../models');
const { audit } = require('../../services/audit.service');
const { PERMISSIONS, ROLE_PERMISSIONS, effectivePermissions } = require('../../config/permissions');

const withPerms = (a) => ({ ...a.toJSON(), effectivePermissions: effectivePermissions(a) });

async function activeSuperAdminCount(excludeId) {
  return Admin.countDocuments({ role: 'SuperAdmin', isActive: true, isDeleted: false, _id: { $ne: excludeId } });
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { isDeleted: false };
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [{ email: rx }, { fullName: rx }, { mobileNumber: rx }];
  }
  const [items, total] = await Promise.all([
    Admin.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('createdBy', 'fullName email'),
    Admin.countDocuments(filter),
  ]);
  return ok(res, paginated(items.map(withPerms), total, p));
}

async function getOne(req, res) {
  const admin = await Admin.findOne({ _id: req.params.adminId, isDeleted: false }).populate('createdBy', 'fullName email');
  if (!admin) throw ApiError.notFound('Admin not found');
  return ok(res, withPerms(admin));
}

async function create(req, res) {
  const exists = await Admin.findOne({ email: req.body.email.toLowerCase() });
  if (exists && !exists.isDeleted) throw ApiError.conflict('An admin with this email already exists');
  if (exists && exists.isDeleted) await exists.deleteOne(); // allow re-creating a removed admin
  const admin = await Admin.create({ ...req.body, createdBy: req.admin._id });
  await audit(req, { action: 'Created', entityType: 'Admin', entityId: admin._id, newValue: admin });
  return created(res, withPerms(admin), 'Admin created successfully');
}

async function update(req, res) {
  const admin = await Admin.findOne({ _id: req.params.adminId, isDeleted: false });
  if (!admin) throw ApiError.notFound('Admin not found');
  const before = admin.toJSON();
  if (admin.role === 'SuperAdmin' && req.body.role && req.body.role !== 'SuperAdmin' && (await activeSuperAdminCount(admin._id)) === 0) {
    throw ApiError.badRequest('At least one active Super Admin is required');
  }
  if (String(admin._id) === String(req.admin._id) && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  const roleChanged = req.body.role && req.body.role !== admin.role;
  Object.assign(admin, req.body);
  if (roleChanged || req.body.isActive === false) admin.tokenVersion += 1; // force re-login
  await admin.save();
  await audit(req, { action: 'Updated', entityType: 'Admin', entityId: admin._id, oldValue: before, newValue: admin });
  return ok(res, withPerms(admin), 'Admin updated');
}

async function toggleActive(req, res) {
  const admin = await Admin.findOne({ _id: req.params.adminId, isDeleted: false });
  if (!admin) throw ApiError.notFound('Admin not found');
  if (String(admin._id) === String(req.admin._id)) throw ApiError.badRequest('You cannot change your own status');
  if (!req.body.isActive && admin.role === 'SuperAdmin' && (await activeSuperAdminCount(admin._id)) === 0) {
    throw ApiError.badRequest('At least one active Super Admin is required');
  }
  admin.isActive = req.body.isActive;
  if (!admin.isActive) admin.tokenVersion += 1;
  await admin.save();
  await audit(req, { action: admin.isActive ? 'Activated' : 'Deactivated', entityType: 'Admin', entityId: admin._id });
  return ok(res, withPerms(admin), 'Status updated');
}

async function resetPassword(req, res) {
  const admin = await Admin.findOne({ _id: req.params.adminId, isDeleted: false });
  if (!admin) throw ApiError.notFound('Admin not found');
  admin.password = req.body.newPassword;
  admin.tokenVersion += 1;
  admin.lockUntil = undefined;
  admin.loginAttempts = 0;
  await admin.save();
  await audit(req, { action: 'PasswordReset', entityType: 'Admin', entityId: admin._id });
  return ok(res, null, 'Password reset');
}

async function remove(req, res) {
  const admin = await Admin.findOne({ _id: req.params.adminId, isDeleted: false });
  if (!admin) throw ApiError.notFound('Admin not found');
  if (String(admin._id) === String(req.admin._id)) throw ApiError.badRequest('You cannot delete your own account');
  if (admin.role === 'SuperAdmin' && (await activeSuperAdminCount(admin._id)) === 0) {
    throw ApiError.badRequest('At least one active Super Admin is required');
  }
  admin.isDeleted = true;
  admin.isActive = false;
  admin.tokenVersion += 1;
  await admin.save();
  await audit(req, { action: 'Deleted', entityType: 'Admin', entityId: admin._id, oldValue: admin });
  return ok(res, null, 'Admin deleted successfully');
}

/** GET /admins/permissions - catalogue used by the permissions editor */
async function permissionCatalogue(_req, res) {
  return ok(res, { permissions: PERMISSIONS, rolePermissions: ROLE_PERMISSIONS });
}

module.exports = { list, getOne, create, update, toggleActive, resetPassword, remove, permissionCatalogue };
