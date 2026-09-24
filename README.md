# PrimeNear

Hyperlocal multi-seller commerce platform. Customers can only buy from the shops that added them as a customer.

| Folder | What | Status |
|--------|------|--------|
| [`backend/`](backend) | Single Node.js + Express + MongoDB API for all apps (`/api/admin`, `/api/seller`, `/api/user`) | Admin, Seller & User API done |
| [`admin-panel/`](admin-panel) | Angular admin dashboard | Done |
| [`seller-app/`](seller-app) | Angular seller app (mobile-first) | Done |
| [`user-app/`](user-app) | Angular customer app (mobile-first) | Done |

## Quick start

```bash
# MongoDB (any one): local install, Atlas, or
docker run -d -p 27017:27017 --name mongo mongo:7

cd backend && cp .env.example .env && npm install && npm run seed:demo && npm run dev
# new terminal
cd admin-panel && npm install && npm start
# open http://localhost:4200  →  admin@primenear.in / Admin@12345
# seller app (another terminal)
cd seller-app && npm install && npm start
# open http://localhost:4300  →  mobile 9876543210, OTP shown on screen in dev
# user app (another terminal)
cd user-app && npm install && npm start
# open http://localhost:4400  →  mobile 9827010000, OTP shown on screen in dev
```

Online payments use Razorpay when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are set; without them (and outside
production) the user app shows a **test payment** screen instead.

See each folder's README for details.
