# PrimeNear

Hyperlocal multi-seller commerce platform. Customers can only buy from the shops that added them as a customer.

| Folder | What | Status |
|--------|------|--------|
| [`backend/`](backend) | Single Node.js + Express + MongoDB API for all apps (`/api/admin`, `/api/seller`, `/api/user`) | Admin API done |
| [`admin-panel/`](admin-panel) | Angular admin dashboard | Done |
| `seller-app/` | Seller app | Next |
| `user-app/` | User app | Next |

## Quick start (admin)

```bash
# MongoDB (any one): local install, Atlas, or
docker run -d -p 27017:27017 --name mongo mongo:7

cd backend && cp .env.example .env && npm install && npm run seed:demo && npm run dev
# new terminal
cd admin-panel && npm install && npm start
# open http://localhost:4200  →  admin@primenear.in / Admin@12345
```

See each folder's README for details.
