# PrimeNear Backend

A single Node.js + Express + MongoDB API for all three PrimeNear apps:

| Route prefix   | App           | Status        |
|----------------|---------------|---------------|
| `/api/admin`   | Admin Panel   | ✅ Implemented |
| `/api/seller`  | Seller App    | ⏳ Next        |
| `/api/user`    | User App      | ⏳ Next        |

All Mongoose models in `src/models` are shared by the three apps.

## Quick start

```bash
cd backend
cp .env.example .env          # edit values
npm install
npm run seed                  # super admin + settings + locations + categories
npm run seed:demo             # (optional) + demo sellers, users, products, orders
npm run dev                   # http://localhost:3000
```

Default super admin (from `.env`): `admin@primenear.in` / `Admin@12345`. Change it after the first login.

MongoDB: local (`mongodb://127.0.0.1:27017/primenear`), Docker (`docker run -d -p 27017:27017 mongo:7`) or MongoDB Atlas.

## Tests

```bash
npm test     # node --test, needs MongoDB (uses database primenear_test, set TEST_MONGODB_URI to override)
```

## Folder structure

```
src/
  app.js, server.js
  config/        env config, db, logger, admin roles & permissions
  models/        shared Mongoose models (Admin, Seller, User, Customer, Product, Order, Payout, ...)
  middleware/    admin auth (JWT + RBAC), Joi validation, uploads, error handler
  services/      business logic: payouts, refunds, order status, analytics, reports, settings, notifications
  controllers/admin/  request handlers
  routes/admin/       route definitions + validation schemas
  jobs/          scheduled reports & daily digest (node-cron)
  seed/          seed script
tests/           API tests (node:test + supertest)
```

## Key business rules (admin side)

- **Seller = shop.** One owner mobile number may own several shops (seller app will show a shop picker).
- **User ↔ Seller link** lives in the `Customer` collection. A user can only use the user app with sellers they are linked to. Admins can link users manually or in bulk from CSV (`mobileNumber,name,sellerName,customerType`).
- **Revenue** = orders whose payment is completed (online paid or cash collected) and not cancelled, minus refunds.
- **Commission** = order value × seller commission % (seller override, else platform default).
- **Payouts**: online orders become payable `payoutDelayDays` after delivery. Net = order value − refunds − commission.
  If *Charge commission on cash orders* is enabled, commission on cash / COD orders is deducted from the payout.
  Refunds on already-paid orders are recovered from the next payout (`seller.pendingDeduction`).
  Payout flow: `Pending → Processing → Completed (UTR required)`; `Failed → retry`; `Rejected` releases the orders.
  Transfers are done manually by the admin (bank/UPI); RazorpayX automation can be added later.
- **Refunds** go through Razorpay when keys are configured and the order has a Razorpay payment; otherwise they are recorded as manual refunds.
- **Security**: bcrypt passwords, JWT with token versioning (logout / password change / deactivation invalidate old tokens),
  account lock after N failed logins, optional TOTP 2FA (can be made mandatory), rate-limited auth routes, helmet, audit log of every admin write,
  bank account numbers encrypted at rest (AES-256-GCM) and masked for admins without payout permission.

## Admin roles

| Permission area            | SuperAdmin | Admin | SupportAdmin |
|----------------------------|:---:|:---:|:---:|
| Dashboard                  | ✓ | ✓ | ✓ |
| Sellers view / manage      | ✓ | ✓ / ✓ | ✓ / – |
| Sellers delete             | ✓ | – | – |
| Users view / manage        | ✓ | ✓ / ✓ | ✓ / – |
| Orders view / manage / refund | ✓ | ✓ | view |
| Payments view / payouts    | ✓ | view | – |
| Categories, locations, products | ✓ | ✓ | view products |
| Disputes                   | ✓ | ✓ | ✓ |
| Analytics & reports        | ✓ | ✓ | – |
| Settings                   | ✓ | view | – |
| Admin users, audit logs    | ✓ | – | – |

Super admins can grant extra permissions to any admin.

## Main endpoints (`/api/admin`)

`auth/*` (login, verify-2fa, logout, me, profile, change/forgot/reset password, 2fa setup/enable/disable) ·
`admins` · `sellers` (+ block, unblock, commission, district-assignment, products, orders, customers, payments, earnings) ·
`users` (+ link-seller, unlink-seller, bulk-link, block) · `orders` (+ status, refund, cancel, notes, disputes) ·
`payments`, `payments/dashboard`, `payouts` (+ pending, initiate, status, retry) · `categories`, `subcategories`, `products` ·
`disputes` (+ assign, comments, resolve, close, reopen) · `locations/districts`, `locations/tahsils` ·
`analytics/{dashboard,revenue,orders,users,sellers,products,payments}` · `reports/{generate,schedule,scheduled}` ·
`settings` (+ commission, gst, delivery, notifications, security, payment, maintenance-mode, upload-logo) ·
`audit-logs`, `system-logs`, `login-history`, `notifications`.

All responses: `{ success, message?, data }`; lists: `data = { items, totalCount, page, limit, pages, ... }`.
