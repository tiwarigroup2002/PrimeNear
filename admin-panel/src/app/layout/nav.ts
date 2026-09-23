export interface NavItem {
  label: string;
  icon: string;
  link: string;
  permissions?: string[];
  children?: NavItem[];
}

export const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [{ label: 'Dashboard', icon: 'bi-speedometer2', link: '/dashboard', permissions: ['dashboard.view'] }],
  },
  {
    section: 'Marketplace',
    items: [
      { label: 'Sellers', icon: 'bi-shop', link: '/sellers', permissions: ['sellers.view'] },
      { label: 'Users', icon: 'bi-people', link: '/users', permissions: ['users.view'] },
      { label: 'Orders', icon: 'bi-bag-check', link: '/orders', permissions: ['orders.view'] },
      { label: 'Products', icon: 'bi-box-seam', link: '/products', permissions: ['products.view'] },
      { label: 'Disputes', icon: 'bi-life-preserver', link: '/disputes', permissions: ['disputes.view'] },
    ],
  },
  {
    section: 'Finance',
    items: [
      { label: 'Payments', icon: 'bi-wallet2', link: '/payments', permissions: ['payments.view'] },
      { label: 'Transactions', icon: 'bi-receipt', link: '/payments/transactions', permissions: ['payments.view'] },
      { label: 'Payouts', icon: 'bi-bank', link: '/payments/payouts', permissions: ['payments.view'] },
    ],
  },
  {
    section: 'Insights',
    items: [
      { label: 'Analytics', icon: 'bi-bar-chart-line', link: '/analytics', permissions: ['analytics.view'] },
      { label: 'Reports', icon: 'bi-file-earmark-bar-graph', link: '/reports', permissions: ['reports.generate'] },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { label: 'Categories', icon: 'bi-tags', link: '/categories', permissions: ['categories.manage'] },
      { label: 'Locations', icon: 'bi-geo-alt', link: '/locations', permissions: ['locations.manage'] },
      { label: 'Settings', icon: 'bi-gear', link: '/settings', permissions: ['settings.view', 'settings.manage'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { label: 'Admin Users', icon: 'bi-person-badge', link: '/admins', permissions: ['admins.manage'] },
      { label: 'Audit Logs', icon: 'bi-journal-text', link: '/audit', permissions: ['audit.view'] },
    ],
  },
];
