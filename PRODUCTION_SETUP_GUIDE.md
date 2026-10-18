# 🚀 PrimeNear Production Deployment & Infrastructure Guide

*Generated on: 19-Oct-2026*  
*Project: PrimeNear E-Commerce Multi-Vendor Platform*

---

## 📌 1. Platform Links & URLs

| Portal | Live Production URL | Purpose |
| :--- | :--- | :--- |
| 🛍️ **Customer Web App** | **https://primenear.com** (or https://www.primenear.com) | Customer shopping, catalog, cart, checkout |
| 🏪 **Seller Portal** | **https://seller.primenear.com** | Vendor dashboard, products, inventory, orders |
| 👑 **Super Admin Panel** | **https://admin.primenear.com** | Master owner administration & approvals |
| ⚡ **Backend Engine API** | **https://api.primenear.com** | Node.js REST API + Webhooks (Port 3000) |

---

## 🔑 2. Super Admin Credentials

- **Admin Login URL**: [https://admin.primenear.com](https://admin.primenear.com)
- **Email**: `admin@primenear.com`
- **Password**: `Admin@12345`

---

## ☁️ 3. AWS Cloud Infrastructure Details

- **Cloud Provider**: Amazon Web Services (AWS)
- **Region**: `ap-southeast-2` (Sydney)
- **AWS Account ID**: `456232108139` (Golden Hour Code / Aashish Tiwari)
- **EC2 Instance ID**: `i-085bb7683827ae214`
- **Instance Name**: `PrimeNear-Production`
- **Instance Type**: `t3.small` (2 vCPU, 2 GB RAM + 4 GB Swap Buffer)
- **Operating System**: Ubuntu 24.04 LTS (Noble)
- **Root Storage**: 30 GB gp3 High-Speed SSD
- **Permanent Elastic IP (Static)**: **`52.62.249.201`**
- **SSH Key Pair**: `primenear`
  - *Local Key File*: `C:\Users\Tiwari\Downloads\primenear.pem`
- **Security Group**: `sg-0ddd92321eecc977f`
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS)

---

## 🌐 4. Hostinger DNS Configuration

Domain: **`primenear.com`**

| Type | Host / Name | Value / Points To | Purpose |
| :---: | :---: | :---: | :---: |
| **A** | `@` | `52.62.249.201` | Root Domain (`primenear.com`) |
| **CNAME** | `www` | `primenear.com` | WWW Domain (`www.primenear.com`) |
| **A** | `seller` | `52.62.249.201` | Seller Subdomain (`seller.primenear.com`) |
| **A** | `admin` | `52.62.249.201` | Admin Subdomain (`admin.primenear.com`) |
| **A** | `api` | `52.62.249.201` | API Subdomain (`api.primenear.com`) |

---

## 📁 5. Server File Structure (`/home/ubuntu/PrimeNear/`)

```text
/home/ubuntu/PrimeNear/
├── backend/
│   ├── src/                 (Controllers, models, routes)
│   ├── .env                 (Production environment configs)
│   ├── uploads/             (Images, bills, invoices)
│   └── package.json
├── user-app/
│   └── dist/user-app/browser/     (Customer site compiled files)
├── seller-app/
│   └── dist/seller-app/browser/   (Seller portal compiled files)
├── admin-panel/
│   └── dist/admin-panel/browser/  (Admin dashboard compiled files)
└── deploy.sh                (1-Click automated deployment script)
```

---

## 💻 6. How to Connect to Server (SSH)

Run from PowerShell on your computer:
```powershell
ssh -i "C:\Users\Tiwari\Downloads\primenear.pem" ubuntu@52.62.249.201
```

---

## 🔄 7. How to Update Code in Future (Daily Routine)

### Step 1: In your Laptop (Antigravity IDE)
1. Make your code changes in `c:\PrimeNearproject\web\PrimeNear\PrimeNear`.
2. Commit and Push to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```

### Step 2: On AWS Server
Connect via SSH and run the 1-click deploy script:
```bash
ssh -i "C:\Users\Tiwari\Downloads\primenear.pem" ubuntu@52.62.249.201 "cd /home/ubuntu/PrimeNear && ./deploy.sh"
```
*This automatically pulls latest code, rebuilds Angular frontends, reloads backend in PM2, and reloads Nginx in under 30 seconds.*

---

## 🛠️ 8. Useful Server Commands

```bash
# Check PM2 backend status
pm2 status

# View live backend logs
pm2 logs primenear-backend

# Restart backend
pm2 restart primenear-backend

# Check Nginx status
sudo systemctl status nginx

# Check MongoDB status
sudo systemctl status mongod

# Test Nginx configuration
sudo nginx -t

# Renew SSL Certificates (Auto-renews automatically)
sudo certbot renew
```

---

## 📦 9. GitHub Repository
- **Main Repo**: https://github.com/tiwarigroup2002/PrimeNear
- **Branch**: `main`
- **Owner**: `tiwarigroup2002`
