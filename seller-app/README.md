# PrimeNear Seller App

Angular 21 app for shop owners. **Mobile-first** (bottom tab bar + big "Bill" button on phones,
sidebar on desktop), light & dark theme. Works in any phone browser and can be wrapped as a PWA /
Capacitor app later.

## Run locally

```bash
# backend must be running on http://localhost:3000 (see ../backend)
cd seller-app
npm install
npm start            # http://localhost:4300  (/api and /uploads proxied to :3000)
```

Login with a seller's mobile number (sellers are created by the admin). Until an SMS gateway is configured
the OTP is shown on the screen ("Test mode OTP") in non-production environments.
Demo data (`npm run seed:demo` in backend): `9876543210` owns two shops (shop picker), `9876543211` has one shop.

## Build

```bash
npm run build        # dist/seller-app/browser
```

For a separately hosted API set `apiUrl` / `fileBaseUrl` in `src/environments/environment.prod.ts`
(e.g. `https://api.primenear.in/api/seller`) and add the app origin to backend `CORS_ORIGINS`.

## Screens

| Screen | Highlights |
|--------|-----------|
| Login | Mobile + 6-box OTP (paste / auto-submit, resend timer), shop picker for multi-shop owners, blocked-shop message |
| Home | Today's sales, month stats, orders needing action, quick actions, 14-day chart, stock alerts, recent orders |
| New bill (POS) | Search / barcode scan, qty +/−, stock checks, saved or walk-in customer (add new inline), discount, Cash / UPI, draft kept if the page closes |
| Invoices | List, printable tax invoice, PDF download, WhatsApp share (Hindi message), SMS |
| Orders | Status tabs with counts, one-tap next step (Accept → Packed → Out for delivery → Delivered), cancel with automatic refund & restock, team notes, call / WhatsApp customer, invoice |
| Products | Search / filters, bulk show / hide / price change / delete, add & edit with photos, GST slab & price preview, margin, auto SKU, QR label print, stock adjust & history, CSV bulk upload |
| Inventory | Stock counts & value, low / out of stock lists, full stock movement log |
| Customers | Add (gives access to the shop in the user app), CSV import, detail with history, call / WhatsApp / SMS, "new bill for this customer" |
| Reports | Sales, estimated profit, GST, cash vs online, counter vs app, best sellers, customers; export PDF / Excel / CSV |
| Earnings & payouts | Due / on hold / paid, monthly chart, payout breakdown with UTR |
| Reviews | Rating distribution, filters, reply to customers |
| Help & support | Contact, FAQ, tickets with photo attachments and chat with support |
| Settings | Shop details & photo, bank / UPI (admins are alerted on change), delivery & COD, notification preferences, dark mode |
