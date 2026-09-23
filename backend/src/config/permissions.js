/**
 * Role based access control for the admin panel.
 * Effective permissions = role defaults + extra permissions stored on the admin.
 */
const PERMISSIONS = {
  'dashboard.view': 'View dashboard',
  'admins.manage': 'Add / edit / remove admin users',
  'sellers.view': 'View sellers',
  'sellers.manage': 'Add, edit, block sellers',
  'sellers.delete': 'Delete sellers',
  'sellers.commission': 'Change seller commission',
  'users.view': 'View users',
  'users.manage': 'Edit, link, block users',
  'users.delete': 'Delete users',
  'orders.view': 'View orders',
  'orders.manage': 'Update order status, cancel, add notes',
  'orders.refund': 'Initiate refunds',
  'payments.view': 'View payments & payouts',
  'payouts.manage': 'Initiate and update seller payouts',
  'products.view': 'View products',
  'products.manage': 'Edit / disable products',
  'categories.manage': 'Manage categories',
  'locations.manage': 'Manage districts & tahsils',
  'disputes.view': 'View disputes',
  'disputes.manage': 'Assign & resolve disputes',
  'analytics.view': 'View analytics',
  'reports.generate': 'Generate & schedule reports',
  'settings.view': 'View platform settings',
  'settings.manage': 'Change platform settings',
  'audit.view': 'View audit, login & system logs',
};

const ALL = Object.keys(PERMISSIONS);

const ROLE_PERMISSIONS = {
  SuperAdmin: ALL,
  Admin: [
    'dashboard.view',
    'sellers.view', 'sellers.manage', 'sellers.commission',
    'users.view', 'users.manage',
    'orders.view', 'orders.manage', 'orders.refund',
    'payments.view',
    'products.view', 'products.manage',
    'categories.manage', 'locations.manage',
    'disputes.view', 'disputes.manage',
    'analytics.view', 'reports.generate',
    'settings.view',
  ],
  SupportAdmin: [
    'dashboard.view',
    'sellers.view', 'users.view', 'orders.view', 'products.view',
    'disputes.view', 'disputes.manage',
  ],
};

function effectivePermissions(admin) {
  if (!admin) return [];
  if (admin.role === 'SuperAdmin') return ALL;
  const base = ROLE_PERMISSIONS[admin.role] || [];
  return [...new Set([...base, ...(admin.permissions || []).filter((p) => ALL.includes(p))])];
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ALL_PERMISSIONS: ALL, effectivePermissions };
