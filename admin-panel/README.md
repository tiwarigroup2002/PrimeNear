# PrimeNear Admin Panel

Angular 21 (standalone components + signals) admin dashboard for the PrimeNear platform.
Desktop-first, responsive down to mobile, light & dark theme.

## Run locally

```bash
# 1. Start the backend first (see ../backend/README.md) on http://localhost:3000
# 2. Then:
cd admin-panel
npm install
npm start            # http://localhost:4200  (API calls to /api are proxied to :3000)
```

Login with the super admin created by `npm run seed` in the backend (default `admin@primenear.in` / `Admin@12345`).

## Build for production

```bash
npm run build        # output: dist/admin-panel/browser
```

Serve the `dist/admin-panel/browser` folder from any static host (Vercel, Netlify, S3 + CloudFront, Nginx).
Configure the host to rewrite unknown routes to `index.html`.

If the API is on another domain, set `apiUrl` / `fileBaseUrl` in `src/environments/environment.prod.ts`
(e.g. `https://api.primenear.in/api/admin` and `https://api.primenear.in`) and add the panel's origin to `CORS_ORIGINS` in the backend `.env`.

## Features

| Area | What you can do |
|------|-----------------|
| Dashboard | Revenue / orders / users / sellers KPIs, today's numbers, trend charts, alerts, recent orders, top sellers & products, CSV export, auto refresh |
| Sellers | List with filters & bulk block, add / edit (bank details, UPI, GST, districts, delivery, commission), shop image, block / unblock / delete, detail tabs (overview, products, orders, customers, payments, performance) |
| Users | List with filters, add & link to seller, CSV bulk link with dry-run preview, detail (linked sellers, addresses, orders), link / unlink, edit, block, delete |
| Orders | Status tabs, search, filters, sort, export; detail with status timeline, items, payments & refunds, update status, cancel (restock + refund), partial refunds, internal notes, call / WhatsApp, print invoice |
| Payments | Money dashboard, transactions list, payouts due per seller (commission / cash commission / recoveries), initiate payouts, mark Processing / Completed (UTR) / Failed / Rejected, retry |
| Products | Platform-wide list, admin disable with reason, edit, reviews moderation |
| Disputes | Tickets by status, create, assign, priority, conversation with image attachments, resolve with refund, close / reopen, timeline |
| Categories | Categories with icons, sub-categories, activate / deactivate |
| Locations | Districts and tahsils with OpenStreetMap picker and service radius |
| Analytics | Revenue, orders, users, sellers, products, payments — any period / custom range |
| Reports | PDF / Excel / CSV generation, download, email, scheduled reports |
| Settings | General, commission & payouts, GST slabs, delivery, payment methods, notifications, security (2FA, session timeout, lockout, password expiry), maintenance mode |
| Admin users | Roles (Super Admin / Admin / Support Admin), extra permissions, reset password, activate / deactivate |
| Audit | Audit log with before/after values, live activity feed, login history, system errors |
| Profile | Edit profile & photo, change password, set up TOTP 2FA (Google Authenticator etc.) |

Menus, buttons and routes are shown only when the admin has the matching permission.
The admin is logged out automatically after the configured inactivity timeout.

## Structure

```
src/app/
  core/        services (api, auth, idle, lookup, toast, confirm, theme), guards, interceptor, models, utils
  shared/      reusable UI: modal, confirm dialog, toasts, page header, stat card, status badge,
               pagination, chart (Chart.js), map picker (Leaflet), seller/user search select, pipes, *appCan directive
  layout/      shell (sidebar + topbar + notifications)
  features/    auth, dashboard, sellers, users, orders, payments, products, disputes,
               categories, locations, analytics, reports, settings, admins, audit, profile
```
