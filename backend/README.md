# PrimeNear Backend

A single Node.js + Express + MongoDB API for all three PrimeNear apps:

| Route prefix   | App           | Status        |
|----------------|---------------|---------------|
| `/api/admin`   | Admin Panel   | ✅ Implemented |
| `/api/seller`  | Seller App    | ✅ Implemented |
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
- **No platform commission.** The shop keeps the full sale. Online payments are collected in the platform Razorpay account and paid to the shop in full after the holding period. Cash and counter bills stay with the shop.
- **Payouts**: online orders become payable `payoutDelayDays` after delivery. Net = order value − refunds.
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

## Seller API (`/api/seller`)

Login is by **mobile + OTP**. Until an SMS gateway is configured (`SMS_PROVIDER`), OTPs are logged and returned as
`devOtp` outside production (or set `DEV_FIXED_OTP`). OTPs expire in 5 minutes, can be resent after 30 s,
max 6 per hour and 5 wrong attempts.

- `POST auth/send-otp`, `POST auth/verify-otp` → a shop token (one shop) or an owner token + shop list (several shops)
- `POST auth/select-shop` / `POST sellers/switch-shop`, `GET auth/shops`, `GET auth/me`, `POST auth/logout`, `GET config`
- `dashboard` · `settings`, `profile`, `bank`, `profile/image`
- `categories` · `products` (+ search, bulk, bulk-upload, toggle-active, barcode) · `inventory` (+ adjust-stock, history, low-stock)
- `customers` (+ search, bulk-link) — adding a customer gives that mobile number access to the shop in the user app
- `orders` (+ status, cancel, add-note, invoice) · `invoices` (counter bill / POS: create, list, detail, pdf, share)
- `analytics/{summary,sales-trend,best-selling,customer-analysis,export-report}` · `earnings`, `payouts`
- `notifications`, `reviews` (+ respond), `support` tickets (+ comments with photos)

Rules: every query is scoped to the logged-in shop; stock is reserved atomically (no overselling) and every change is
logged in `StockMovement`; sellers move orders only along Pending → Confirmed → Packed → Shipped → Delivered;
cancelling a paid app order refunds it and restocks; products disabled by an admin cannot be re-enabled;
bank detail changes notify the admins; maintenance mode returns `503` to the seller app.
**Counter bills (POS)** are paid to the seller directly (cash or UPI), so they are never part of platform payouts;
their commission is only recovered when *Charge commission on cash orders* is enabled.

## User API (`/api/user`)

Login is by **mobile + OTP** and is allowed only when at least one active shop has added the number as a customer
(otherwise a Hindi/English "ask your shopkeeper to add you" message). Each user always has one *active shop*;
the catalog, home page and cart work on that shop.

- `GET config` · `POST auth/send-otp`, `POST auth/verify-otp`, `GET auth/me`, `POST auth/logout`
- `profile` (+ `upload-image`, `preferences`), `location/update`, `dashboard`, `addresses` (+ `set-default`), `notifications`
- `home`, `sellers` (+ `switch`, `:id/profile`, `:id/reviews`), `categories`, `products` (search, category, price, rating,
  in-stock filters, sort), `products/:id`, `wishlist`
- `cart` (+ `add-item`, `update-item`, `remove-item/:id`, `clear`) — live prices, stock problems per line, delivery charge
- `orders/create` → Cash: order placed · Online: Razorpay order (`payment.gateway = razorpay`) or a test payment
  (`gateway = mock`, only when Razorpay keys are missing and not in production); `orders/verify-payment`,
  `orders/:id/{payment-failed,retry-payment,cancel,return,return-status,track,reorder,reviews,invoice}`
- `reviews` (shop + product stars, optional photos), `invoices` (+ `download` PDF), `support` tickets (+ comments)
- `POST /api/payments/razorpay/webhook` confirms `payment.captured` even if the browser closed before verification

Rules: the cart holds products of one shop only (adding from another shop empties it); unpaid online orders are hidden
from the seller and cancelled automatically after 30 minutes (stock released); users can cancel until the order is packed
(paid orders are refunded); returns can be requested for 7 days after delivery and are approved/rejected by the shop
(approval refunds and restocks); ratings are recomputed from visible reviews.
