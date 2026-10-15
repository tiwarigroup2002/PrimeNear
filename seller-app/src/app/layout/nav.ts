export interface NavItem { label: string; icon: string; link: string; badge?: string }

/** Full menu (sidebar on desktop, "More" sheet on mobile). */
export const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ label: 'Home', icon: 'bi-house', link: '/dashboard' }, { label: 'New bill', icon: 'bi-receipt-cutoff', link: '/billing' }] },
  {
    section: 'Shop',
    items: [
      { label: 'Orders', icon: 'bi-bag-check', link: '/orders' },
      { label: 'Products', icon: 'bi-box-seam', link: '/products' },
      { label: 'Inventory', icon: 'bi-boxes', link: '/inventory' },
      { label: 'Customers', icon: 'bi-people', link: '/customers' },
      { label: 'Invoices', icon: 'bi-file-earmark-text', link: '/invoices' },
      { label: 'Returns', icon: 'bi-arrow-return-left', link: '/returns' },
    ],
  },
  {
    section: 'Business',
    items: [
      { label: 'Reports', icon: 'bi-bar-chart-line', link: '/analytics' },
      { label: 'Earnings & payouts', icon: 'bi-wallet2', link: '/earnings' },
      { label: 'PrimeNear bills', icon: 'bi-receipt-cutoff', link: '/subscription-bills' },
      { label: 'Reviews', icon: 'bi-star', link: '/reviews' },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Notifications', icon: 'bi-bell', link: '/notifications' },
      { label: 'Help & support', icon: 'bi-life-preserver', link: '/support' },
      { label: 'Settings', icon: 'bi-gear', link: '/settings' },
    ],
  },
];

/** Bottom tab bar: Home, Add product, Invoices, Orders, Customers. */
export const TABS: NavItem[] = [
  { label: 'Home', icon: 'bi-house', link: '/dashboard' },
  { label: 'Add', icon: 'bi-plus-square', link: '/products/new' },
  { label: 'Invoices', icon: 'bi-receipt', link: '/invoices' },
  { label: 'Orders', icon: 'bi-bag-check', link: '/orders' },
  { label: 'Customers', icon: 'bi-people', link: '/customers' },
];
