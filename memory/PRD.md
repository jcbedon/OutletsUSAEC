# PRD - OUTLETS USA EC - SaaS Live Shopping Platform

## Problem Statement
Multi-tenant SaaS platform for TikTok Live Shopping businesses. Each business (tenant) manages their own clients, live shopping sessions, wallets, purchases, shipments, and referrals with full data isolation.

## Core Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB
- **Auth**: Custom JWT-based with 3 roles (superadmin, admin, client)
- **Multi-Tenant**: All data scoped by `tenant_id`

## Roles
1. **SUPERADMIN**: Global admin. Creates/manages tenants and their admins.
2. **ADMIN**: Tenant-scoped. Manages clients, live sessions, wallets, shipments, referrals. Can upload tenant logo and create clients.
3. **CLIENT**: Tenant-scoped. Views wallet, purchases, shipments, notifications.

## Business Logic
- Tax: Selectable (8.25% Illinois, 15% Custom, or Sin Tax) - applied per purchase
- Commission: Configurable per purchase (default $3.00) - no longer per-client for new purchases
- Display total = price + tax + commission
- **Full purchase total (price + tax + commission) is deducted from client wallet** - Negative balances are allowed
- Referral bonus: Configurable per tenant
- **Shipment Cost**: Added to purchase total to calculate "Total a Recargar"

## Implemented Features (Feb 2026)

### Multi-Tenancy & Auth
- [x] Multi-tenant architecture with tenant_id isolation
- [x] JWT authentication with 3 roles
- [x] Superadmin dashboard (create/list/suspend tenants)
- [x] Tenant creation with auto-admin creation

### Admin Dashboard
- [x] Admin dashboard with stats, quick actions
- [x] **NEW: Estadísticas page** - comprehensive business statistics dashboard (Feb 22, 2026)
  - Ganancia total (Comisiones + Envíos)
  - Ventas por Tienda (ranked list)
  - Ventas por Live (ranked list)
  - Desglose de Ingresos (productos, tax, comisiones, envíos)
  - Estado de Wallets (depósitos, saldos, peso enviado)
  - **Gráficas interactivas con Recharts:**
    - Tendencia de ventas (30 días) - Área chart
    - Ventas por Tienda - Barras horizontales
    - Distribución de Ganancias - Pie chart donut
    - Ventas por Live - Barras verticales

### Client Management
- [x] Admin: Create clients with custom commission + initial balance
- [x] Admin: Client management (search, edit commission)
- [x] Admin: Search filter by name, initials, ID, WhatsApp

### Live Shopping & Purchases
- [x] Admin: Live shopping session CRUD
- [x] Admin: Purchase registration with tax + commission calc
- [x] **Tax radio buttons**: 8.25% (Illinois), 15% (Custom), Sin Tax (Feb 22, 2026)
- [x] Admin: Edit/Delete purchases from Live module
- [x] Commission set per-purchase (not per-client) for new purchases
- [x] Client autocomplete in Live Shopping module
- [x] Dynamic tax configuration per tenant (SuperAdmin)

### Wallet & Recharges
- [x] Admin: Wallet deposit requests + approvals with screenshot proof
- [x] Admin: Reject pending deposit requests
- [x] Admin: Global deposit history - view all deposits from all clients
- [x] Admin: Manual balance adjustment - subtract money with custom reason

### Shipments
- [x] Admin: Shipment management with tracking and status
- [x] Admin: Shipment cost added to total recharge amount
- [x] Admin: Edit/Delete shipments
- [x] Admin: Attach media files to shipments
- [x] Client: View shipment attachments (BUG FIX Feb 22 - fixed logout issue)
- [x] Client: View products included in shipment
- [x] Client: Video playback for video attachments
- [x] Weight in pounds (weight_pounds) field for shipments

### Invoicing System (NEW - Apr 2026)
- [x] Admin: Generate invoices from pending purchases
- [x] Admin: Approve/Reopen invoices
- [x] Admin: Remove items from invoices
- [x] Admin: View invoice history per client
- [x] **PDF Download v2**: Modern SaaS-style invoice PDF (Apr 4, 2026)
  - Diseño minimalista tipo Stripe/Shopify
  - Logo del tenant con proporciones originales (object-fit: contain)
  - **Información de envío**: Costo, Peso, Tracking en el PDF
  - **Saldo pendiente del cliente**: Mostrado si tiene deuda (rojo)
  - **QR con token temporal**: Acceso directo al dashboard del cliente
    - Token de un solo uso con 30s de gracia
    - Expira en 24 horas
    - Ruta: /access/{token} → Dashboard del cliente
  - Estados dinámicos: PAGADA (verde), PENDIENTE (amarillo), CANCELADA (rojo)
  - Colores: fondo #F8FAFC, texto #0F172A, contenedor blanco con sombra
  - Footer: "Gracias por su compra" + fecha de generación
  - jspdf + jspdf-autotable v5.x + qrcode
- [x] Tracking URL configuration per tenant (SuperAdmin)

### Reports
- [x] Admin: Reports module with export to PDF/Excel
- [x] Reports by client, by live, all purchases
- [x] Weight in pounds displayed in reports
- [x] Search filters in Reports module

### Branding & UI
- [x] **NEW: Custom favicon** - Outlets USA EC logo as browser icon (Feb 22, 2026)
- [x] **NEW: Page title "Outlets USA EC"** (Feb 22, 2026)
- [x] Admin: Logo upload for tenant branding
- [x] Dynamic logo across all pages
- [x] Complete UI redesign with modern color palette (#1E3A5F, #2ECC71, etc.)

### Client Features
- [x] Client: Dashboard with wallet, purchases, shipments
- [x] Client: Tracking number visible
- [x] Client: "Total a Recargar" display
- [x] Client: Upload proof of deposit
- [x] Client: Self-registration with tenant slug code
- [x] Client: View shipment attachments

## DB Collections
- `tenants`: id, business_name, slug, owner_name, email, logo_url, status
- `users`: id, tenant_id, customer_id, name, role, commission_fee, etc.
- `wallets`: id, tenant_id, user_id, available, reserved
- `wallet_transactions`: id, tenant_id, user_id, type, amount, status, proof_url
- `lives`: id, tenant_id, title, store, status, total_sales, total_commissions
- `purchases`: id, tenant_id, user_id, item_name, price, tax, commission, total, apply_tax, apply_commission, tax_rate
- `shipments`: id, tenant_id, user_id, purchase_ids, status, tracking, attachments, weight_pounds
- `notifications`: id, tenant_id, user_id, type, title, message
- `settings`: tenant_id, key, value (e.g., referral_bonus)

## Key API Endpoints

### Wallet Module
- `GET /api/wallet/pending-deposits` - Get pending deposit requests
- `GET /api/wallet/all-deposits` - Get all deposits (history) with user names
- `POST /api/wallet/approve-deposit/{id}` - Approve a pending deposit
- `POST /api/wallet/reject-deposit/{id}` - Reject a pending deposit
- `POST /api/wallet/admin-adjustment` - Manual balance adjustment (subtract)

### Reports Module
- `GET /api/admin/reports/summary` - Basic summary stats
- `GET /api/admin/reports/business-stats` - **NEW** Comprehensive business statistics
- `GET /api/admin/reports/clients-purchases` - Client purchase reports
- `GET /api/admin/reports/all-purchases` - All purchases report
- `GET /api/admin/reports/live/{id}` - Live-specific report

## Key Credentials
- Superadmin: superadmin@outletsusaec.com / super123
- Admin (Outlets USA EC): admin@outletsusaec.com / admin123
- Client (Juan Perez): J2934 / client123
- Tenant slug example: outlets-usa

## P1 - Backlog
- [ ] Email notifications (pendiente elección de proveedor: Resend/SendGrid)
- [ ] WhatsApp Cloud API integration (requires user credentials)
- [ ] PWA manifest + service worker for mobile install
- [ ] Superadmin: edit tenant details
- [ ] Superadmin: view tenant admins list
- [ ] Client: request deposit from dashboard
- [ ] Admin: bulk import clients

## P2 - Future
- [ ] Multi-language support
- [ ] Backend refactoring (split server.py into routers - currently ~2000 lines)
- [ ] InvoiceDialog.jsx refactoring (currently ~920 lines)
