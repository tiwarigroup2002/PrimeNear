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
    ],
  },
  {
    section: 'Business',
    items: [
      { label: 'Reports', icon: 'bi-bar-chart-line', link: '/analytics' },
      { label: 'Earnings & payouts', icon: 'bi-wallet2', link: '/earnings' },
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

/** Bottom tab bar on phones. The middle item is the big "bill" button. */
export const TABS: NavItem[] = [
  { label: 'Home', icon: 'bi-house', link: '/dashboard' },
  { label: 'Orders', icon: 'bi-bag-check', link: '/orders' },
  { label: 'Bill', icon: 'bi-plus-lg', link: '/billing' },
  { label: 'Products', icon: 'bi-box-seam', link: '/products' },
];
