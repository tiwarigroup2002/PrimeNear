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

### Locations (PIN code based, no GPS / map), delivery area and delivery OTP

- **India location directory**: state → district → taluka → PIN codes from the free *All India Pincode Directory*
  (Open Government Data / India Post). It is downloaded once from `INDIA_LOCATIONS_URL` and cached in
  `storage/india-locations.json` (~0.5 MB); PIN codes missing from it are looked up in the free India Post API
  (`PINCODE_API_URL`, api.postalpincode.in). Set `INDIA_LOCATIONS_FILE` to a local CSV to work offline.
  Admin: `GET /api/admin/locations/directory/{states,districts?state=,talukas?state=&district=}`,
  `GET locations/pincode/:pin`, `POST locations/import { state, district, talukas: 'all' | [names] }`.
- **Shop visibility**: a shop that added the customer is always shown and the customer can buy from anywhere.
  There is no phone location tracking.
- **Seller selling area** (admin seller form): shop PIN code (required) sets the shop's taluka; the selling area is a
  list of `{ state, district, talukas: 'all' | [names] }` (all, several or one taluka per district) → `serviceTahsilIds`.
  Without a selling area the shop sells only in its own taluka.
- **Addresses**: PIN code is required; taluka, district and state are filled from it (`GET /api/user/pincode/:pin`).
- **Delivery area** (checkout, `POST orders/check-delivery { addressId }` and again on `orders/create`): the delivery
  address PIN code must be the shop's PIN code or a PIN code of a taluka in its selling area. Store pickup is always allowed.
- **Billing address**: `billingAddressId` on `orders/create` (default: the delivery address, or the default address
  for pickup). It needs a PIN code, can be anywhere in India, and is printed on the invoice ("Bill to").
- **Delivery OTP**: app orders are marked *Delivered* only with the customer's 4 digit code.
  Seller: `POST /api/seller/orders/:id/delivery-otp` (SMS + app notification, 30 s resend) then
  `PUT /api/seller/orders/:id/status { status: 'Delivered', otp }` (5 attempts). The customer sees the code on the
  order page (`deliveryCode`); the seller API never returns it. Counter bills (POS) do not need it.
- **Seller extras**: change a customer's phone number (`PUT customers/:id { mobileNumber }` moves the shop link to that
  number), add sub-categories (`POST categories/:id/subcategories`, shared with all shops), product videos (field
  `videos`, up to 2 × 60 MB, kept with `keepVideos`), `settings.showGstOnInvoice` to hide the GSTIN on bills.
- **Media compression**: product photos are resized to max 1600 px with `sharp`; videos are re-encoded to 720p H.264
  in the background with `ffmpeg-static` (the file is replaced only when smaller). If either package is missing the
  original file is kept.

### Product variants (colour / size)

- `Product.variants[]`: `{ color, size, sku, sellingPrice, mrp, stock, images[], isActive }` — every combination has its
  own price (GST rate stays at product level), stock and photos. Product `stock` is the total of its variants and its
  price is the cheapest active variant ("from ₹…").
- Seller: send `variants` (JSON string) with `POST/PUT /api/seller/products`. Existing variants keep their stock
  (change it with `POST inventory/adjust-stock { productId, variantId, quantity }`); new ones take the given opening
  stock. Photos per variant: `POST products/:id/variants/:variantId/images` (field `images`, up to 6, compressed);
  keep existing ones by listing them in the variant's `images` on update.
- Cart / orders / bills carry `variantId` + `variantLabel` ("Red / M"); stock is reserved and returned per variant.
  User: `POST cart/add-item { productId, variantId }`; POS bill items `{ productId, variantId, quantity }`.

### Seller payouts

Online payments stay with the platform. An order becomes payable `payoutDelayDays` (default **7**) after delivery and
then shows in *Admin → Payouts → Due for payout* (initiate, mark completed with UTR). `GET /api/admin/payouts/on-hold`
(*On hold* tab) lists paid online orders not payable yet, per seller, with the date each becomes payable.

### Customer limit per seller

`customerLimit` is required when the admin creates a seller (`POST /api/admin/sellers`) and can be changed later.
A shop cannot link more customers than that — checked for seller add / CSV import, admin user create / link / bulk
link (rows over the limit fail with a message), and bill sharing (the bill is still shared, the number is just not
added). `GET /api/seller/customers` returns `customerCount`, `customerLimit` and `customersLeft`.
Older shops without a limit (`null`) are not restricted until the admin sets one.

### Subscription bills (PrimeNear -> seller)

Admins make subscription bills for sellers by hand (nothing is generated automatically).

- **Bill design** (`GET/PUT /api/admin/subscription-bills/template`, logo / signature upload at `POST .../template/image?kind=logo|signature`): company details, GSTIN/PAN, bank details, extra company fields, title, number format (`{FY}`, `{YYYY}`, `{MM}`, `{SEQ}`, e.g. `PN/{FY}/{SEQ}` -> `PN/2026-27/0001`), layout (classic / modern / compact), accent colour, logo position, font size, paper size, which fields are shown, renamed labels, default plan / HSN / GST % / due days, notes, terms, footer and signature.
- **Bills**: `POST /subscription-bills` creates a draft (or `issue: true` to issue at once). Drafts can be edited or deleted. Issuing gives the next number, freezes the design on the bill (later design changes don't change it) and notifies the seller. Issued bills can be marked paid or cancelled (numbers are never reused).
- **GST**: seller in the same state as the company -> CGST + SGST, other state -> IGST, or "No GST". Only tax rows with an amount are printed (screen and PDF).
- **Permissions**: `billing.view`, `billing.manage` (Super Admin and Admin can manage; Support Admin cannot see bills).
- **Seller app**: "PrimeNear bills" page shows issued / paid / cancelled bills (not drafts) with PDF download: `GET /api/seller/subscription-bills`, `/:id`, `/:id/pdf`.
