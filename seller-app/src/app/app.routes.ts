import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  { path: 'select-shop', loadComponent: () => import('./features/auth/select-shop.component').then((m) => m.SelectShopComponent) },
  { path: 'maintenance', loadComponent: () => import('./features/auth/maintenance.component').then((m) => m.MaintenanceComponent) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Home', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'products', title: 'Products', loadComponent: () => import('./features/products/product-list.component').then((m) => m.ProductListComponent) },
      { path: 'products/new', title: 'Add product', loadComponent: () => import('./features/products/product-form.component').then((m) => m.ProductFormComponent) },
      { path: 'products/bulk-upload', title: 'Bulk upload', loadComponent: () => import('./features/products/bulk-upload.component').then((m) => m.BulkUploadComponent) },
      { path: 'products/:id', title: 'Product', loadComponent: () => import('./features/products/product-form.component').then((m) => m.ProductFormComponent) },
      { path: 'billing', title: 'New bill', loadComponent: () => import('./features/billing/billing.component').then((m) => m.BillingComponent) },
      { path: 'invoices', title: 'Invoices', loadComponent: () => import('./features/invoices/invoice-list.component').then((m) => m.InvoiceListComponent) },
      { path: 'invoices/:id', title: 'Invoice', loadComponent: () => import('./features/invoices/invoice-view.component').then((m) => m.InvoiceViewComponent) },
      { path: 'orders', title: 'Orders', loadComponent: () => import('./features/orders/order-list.component').then((m) => m.OrderListComponent) },
      { path: 'orders/:id', title: 'Order', loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent) },
      { path: 'customers', title: 'Customers', loadComponent: () => import('./features/customers/customer-list.component').then((m) => m.CustomerListComponent) },
      { path: 'customers/bulk-upload', title: 'Bulk add customers', loadComponent: () => import('./features/products/bulk-upload.component').then((m) => m.BulkUploadComponent) },
      { path: 'customers/:id', title: 'Customer', loadComponent: () => import('./features/customers/customer-detail.component').then((m) => m.CustomerDetailComponent) },
      { path: 'inventory', title: 'Inventory', loadComponent: () => import('./features/inventory/inventory.component').then((m) => m.InventoryComponent) },
      { path: 'analytics', title: 'Reports', loadComponent: () => import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent) },
      { path: 'earnings', title: 'Earnings', loadComponent: () => import('./features/earnings/earnings.component').then((m) => m.EarningsComponent) },
      { path: 'subscription-bills', title: 'PrimeNear bills', loadComponent: () => import('./features/subscription/subscription-bills.component').then((m) => m.SubscriptionBillsComponent) },
      { path: 'subscription-bills/:id', title: 'PrimeNear bill', loadComponent: () => import('./features/subscription/subscription-bill.component').then((m) => m.SubscriptionBillComponent) },
      { path: 'returns', title: 'Returns', loadComponent: () => import('./features/returns/returns.component').then((m) => m.ReturnsComponent) },
      { path: 'reviews', title: 'Reviews', loadComponent: () => import('./features/reviews/reviews.component').then((m) => m.ReviewsComponent) },
      { path: 'support', title: 'Support', loadComponent: () => import('./features/support/support.component').then((m) => m.SupportComponent) },
      { path: 'support/:id', title: 'Ticket', loadComponent: () => import('./features/support/ticket.component').then((m) => m.TicketComponent) },
      { path: 'notifications', title: 'Notifications', loadComponent: () => import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent) },
      { path: 'settings', title: 'Settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
