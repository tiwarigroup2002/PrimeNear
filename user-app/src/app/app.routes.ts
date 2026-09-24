import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  { path: 'maintenance', loadComponent: () => import('./features/misc/maintenance.component').then((m) => m.MaintenanceComponent) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent) },
      { path: 'search', loadComponent: () => import('./features/catalog/search.component').then((m) => m.SearchComponent) },
      { path: 'product/:id', loadComponent: () => import('./features/catalog/product.component').then((m) => m.ProductComponent) },
      { path: 'shop/:id', loadComponent: () => import('./features/catalog/shop.component').then((m) => m.ShopComponent) },
      { path: 'wishlist', loadComponent: () => import('./features/catalog/wishlist.component').then((m) => m.WishlistComponent) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart.component').then((m) => m.CartComponent) },
      { path: 'checkout', loadComponent: () => import('./features/cart/checkout.component').then((m) => m.CheckoutComponent) },
      { path: 'order-success/:id', loadComponent: () => import('./features/cart/order-success.component').then((m) => m.OrderSuccessComponent) },
      { path: 'orders', loadComponent: () => import('./features/orders/orders.component').then((m) => m.OrdersComponent) },
      { path: 'orders/:id', loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent) },
      { path: 'account', loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent) },
      { path: 'account/profile', loadComponent: () => import('./features/account/profile.component').then((m) => m.ProfileComponent) },
      { path: 'account/addresses', loadComponent: () => import('./features/account/addresses.component').then((m) => m.AddressesComponent) },
      { path: 'account/settings', loadComponent: () => import('./features/account/settings.component').then((m) => m.SettingsComponent) },
      { path: 'invoices', loadComponent: () => import('./features/account/invoices.component').then((m) => m.InvoicesComponent) },
      { path: 'invoices/:id', loadComponent: () => import('./features/account/invoice-view.component').then((m) => m.InvoiceViewComponent) },
      { path: 'support', loadComponent: () => import('./features/account/support.component').then((m) => m.SupportComponent) },
      { path: 'support/:id', loadComponent: () => import('./features/account/ticket.component').then((m) => m.TicketComponent) },
      { path: 'notifications', loadComponent: () => import('./features/account/notifications.component').then((m) => m.NotificationsComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
