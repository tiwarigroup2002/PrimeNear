import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/guards/auth.guard';
import { ShellComponent } from './layout/shell.component';

const perm = (...permissions: string[]) => ({ canActivate: [permissionGuard], data: { permissions } });

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
      { path: 'verify-2fa', loadComponent: () => import('./features/auth/verify-2fa.component').then((m) => m.Verify2faComponent) },
      { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent) },
      { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Dashboard', ...perm('dashboard.view'), loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'sellers', title: 'Sellers', ...perm('sellers.view'), loadComponent: () => import('./features/sellers/seller-list.component').then((m) => m.SellerListComponent) },
      { path: 'sellers/new', title: 'Add seller', ...perm('sellers.manage'), loadComponent: () => import('./features/sellers/seller-form.component').then((m) => m.SellerFormComponent) },
      { path: 'sellers/:id', title: 'Seller', ...perm('sellers.view'), loadComponent: () => import('./features/sellers/seller-detail.component').then((m) => m.SellerDetailComponent) },
      { path: 'sellers/:id/edit', title: 'Edit seller', ...perm('sellers.manage'), loadComponent: () => import('./features/sellers/seller-form.component').then((m) => m.SellerFormComponent) },
      { path: 'users', title: 'Users', ...perm('users.view'), loadComponent: () => import('./features/users/user-list.component').then((m) => m.UserListComponent) },
      { path: 'users/bulk-link', title: 'Bulk link users', ...perm('users.manage'), loadComponent: () => import('./features/users/bulk-link.component').then((m) => m.BulkLinkComponent) },
      { path: 'users/:id', title: 'User', ...perm('users.view'), loadComponent: () => import('./features/users/user-detail.component').then((m) => m.UserDetailComponent) },
      { path: 'orders', title: 'Orders', ...perm('orders.view'), loadComponent: () => import('./features/orders/order-list.component').then((m) => m.OrderListComponent) },
      { path: 'orders/:id', title: 'Order', ...perm('orders.view'), loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent) },
      { path: 'payments', title: 'Payments', ...perm('payments.view'), loadComponent: () => import('./features/payments/payment-dashboard.component').then((m) => m.PaymentDashboardComponent) },
      { path: 'payments/transactions', title: 'Transactions', ...perm('payments.view'), loadComponent: () => import('./features/payments/transaction-list.component').then((m) => m.TransactionListComponent) },
      { path: 'payments/payouts', title: 'Payouts', ...perm('payments.view'), loadComponent: () => import('./features/payments/payouts.component').then((m) => m.PayoutsComponent) },
      { path: 'payments/payouts/:id', title: 'Payout', ...perm('payments.view'), loadComponent: () => import('./features/payments/payout-detail.component').then((m) => m.PayoutDetailComponent) },
      { path: 'subscription-bills', title: 'Subscription bills', ...perm('billing.view'), loadComponent: () => import('./features/billing/bill-list.component').then((m) => m.BillListComponent) },
      { path: 'subscription-bills/new', title: 'New bill', ...perm('billing.manage'), loadComponent: () => import('./features/billing/bill-editor.component').then((m) => m.BillEditorComponent) },
      { path: 'subscription-bills/design', title: 'Bill design', ...perm('billing.manage'), loadComponent: () => import('./features/billing/bill-design.component').then((m) => m.BillDesignComponent) },
      { path: 'subscription-bills/:id', title: 'Subscription bill', ...perm('billing.view'), loadComponent: () => import('./features/billing/bill-detail.component').then((m) => m.BillDetailComponent) },
      { path: 'subscription-bills/:id/edit', title: 'Edit bill', ...perm('billing.manage'), loadComponent: () => import('./features/billing/bill-editor.component').then((m) => m.BillEditorComponent) },
      { path: 'products', title: 'Products', ...perm('products.view'), loadComponent: () => import('./features/products/product-list.component').then((m) => m.ProductListComponent) },
      { path: 'products/:id', title: 'Product', ...perm('products.view'), loadComponent: () => import('./features/products/product-detail.component').then((m) => m.ProductDetailComponent) },
      { path: 'disputes', title: 'Disputes', ...perm('disputes.view'), loadComponent: () => import('./features/disputes/dispute-list.component').then((m) => m.DisputeListComponent) },
      { path: 'disputes/:id', title: 'Dispute', ...perm('disputes.view'), loadComponent: () => import('./features/disputes/dispute-detail.component').then((m) => m.DisputeDetailComponent) },
      { path: 'categories', title: 'Categories', ...perm('categories.manage'), loadComponent: () => import('./features/categories/categories.component').then((m) => m.CategoriesComponent) },
      { path: 'locations', title: 'Locations', ...perm('locations.manage'), loadComponent: () => import('./features/locations/locations.component').then((m) => m.LocationsComponent) },
      { path: 'analytics', title: 'Analytics', ...perm('analytics.view'), loadComponent: () => import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent) },
      { path: 'reports', title: 'Reports', ...perm('reports.generate'), loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent) },
      { path: 'settings', title: 'Settings', ...perm('settings.view', 'settings.manage'), loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
      { path: 'admins', title: 'Admin users', ...perm('admins.manage'), loadComponent: () => import('./features/admins/admins.component').then((m) => m.AdminsComponent) },
      { path: 'audit', title: 'Audit logs', ...perm('audit.view'), loadComponent: () => import('./features/audit/audit.component').then((m) => m.AuditComponent) },
      { path: 'profile', title: 'My profile', loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
