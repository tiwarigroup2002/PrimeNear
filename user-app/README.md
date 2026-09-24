# PrimeNear User App

Angular 21 customer app. **Mobile-first** (sticky header with shop switcher, bottom navigation on phones,
full-width layout on desktop), light & dark theme, indigo theme colour. Works in any phone browser and can be
wrapped as a PWA / Capacitor app later.

## Run locally

```bash
# backend must be running on http://localhost:3000 (see ../backend)
cd user-app
npm install
npm start            # http://localhost:4400  (/api and /uploads proxied to :3000)
```

Only mobile numbers added by a shop (seller app → Customers) can log in. Until an SMS gateway is configured the OTP
is shown on screen ("Test mode OTP") outside production.
Demo data (`npm run seed:demo` in backend): `9827010000` is a customer of two shops, `9827010001`… of one.

## Build

```bash
npm run build        # dist/user-app/browser
```

For a separately hosted API set `apiUrl` / `fileBaseUrl` in `src/environments/environment.prod.ts`
(e.g. `https://api.primenear.in/api/user`) and add the app origin to backend `CORS_ORIGINS`.

## Screens

| Screen | Highlights |
|--------|-----------|
| Login | Mobile + 6-box OTP (paste / auto-submit, resend timer); "not a customer of any shop yet" message in Hindi & English |
| Home | Active shop banner (rating, area, delivery / COD info), categories, recent orders, best sellers, new arrivals |
| Shop switcher | Sheet with all linked shops; warns that the cart will be emptied when switching |
| Search | Live search, category & sub-category chips, sort, filter sheet (price, rating, in stock), load more; filters kept in the URL |
| Product | Photo gallery, price with GST breakdown & discount, stock message, qty stepper, add to cart / buy now, wishlist, reviews, similar products, shop card |
| Cart | Live prices, per-item problems (out of stock / only N left), qty stepper, bill with GST, delivery & savings, free-delivery hint |
| Checkout | Home delivery or store pickup, address picker / add address (with GPS), Pay online or Cash on delivery / at store, note to shop |
| Payment | Razorpay Checkout (UPI, cards, net banking, wallets); test-payment sheet when the server has no Razorpay keys; pay later within 30 min from the order |
| Orders | Tabs (active, delivered, cancelled, store bills), progress tracker, timeline, cancel with reason (auto refund), return with photos, rate shop & products, order again, invoice, call shop, get help |
| Account | Profile & photo, addresses, settings (theme, language, notification channels), wishlist with price-drop badges, invoices (view / print / PDF), notifications, help & support tickets with chat |

Maintenance mode (set by the admin) shows a maintenance screen; blocked accounts are logged out with a message.
