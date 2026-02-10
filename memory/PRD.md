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
- Tax: 8.25% (Illinois tax) applied to item price
- Commission: Configurable per client (default $3.00)
- Display total = price + tax + commission
- **Full purchase total (price + tax + commission) is deducted from client wallet** - Negative balances are allowed
- Referral bonus: Configurable per tenant
- **Shipment Cost**: Added to purchase total to calculate "Total a Recargar"

## Implemented Features (Feb 2026)
- [x] Multi-tenant architecture with tenant_id isolation
- [x] JWT authentication with 3 roles
- [x] Superadmin dashboard (create/list/suspend tenants)
- [x] Tenant creation with auto-admin creation
- [x] Admin dashboard with stats, quick actions
- [x] Admin: Create clients with custom commission + initial balance
- [x] Admin: Client management (search, edit commission)
- [x] Admin: Live shopping session CRUD
- [x] Admin: Purchase registration with tax + commission calc
- [x] Admin: Edit/Delete purchases from Live module
- [x] Admin: Wallet deposit requests + approvals with screenshot proof
- [x] Admin: Shipment management with tracking and status (Preparación, En Tránsito, Completado)
- [x] Admin: Shipment cost added to total recharge amount with informational label
- [x] Admin: Referral bonus configuration
- [x] Admin: Reports module with export to PDF/Excel (by client, by live, all purchases)
- [x] Admin: Logo upload for tenant branding
- [x] Client: Dashboard with wallet, purchases, shipments (tracking visible), notifications
- [x] Client: Upload proof of deposit (screenshot) for recharge requests
- [x] Client: Self-registration with tenant slug code
- [x] Dynamic logo across all pages (from tenant settings)
- [x] Role-based routing (superadmin/admin/client)
- [x] Complete UI redesign with modern color palette (#1E3A5F, #2ECC71, etc.)

## DB Collections
- `tenants`: id, business_name, slug, owner_name, email, logo_url, status
- `users`: id, tenant_id, customer_id, name, role, commission_fee, etc.
- `wallets`: id, tenant_id, user_id, available, reserved
- `wallet_transactions`: id, tenant_id, user_id, type, amount, status
- `lives`: id, tenant_id, title, status, total_sales, total_commissions
- `purchases`: id, tenant_id, user_id, item_name, price, tax, commission, total
- `shipments`: id, tenant_id, user_id, purchase_ids, status, tracking
- `notifications`: id, tenant_id, user_id, type, title, message
- `settings`: tenant_id, key, value (e.g., referral_bonus)

## Key Credentials
- Superadmin: superadmin@outletsusaec.com / super123
- Tenant slug example: outlets-usa

## P1 - Backlog
- [ ] WhatsApp Cloud API integration (requires user credentials)
- [ ] PWA manifest + service worker for mobile install
- [ ] Superadmin: edit tenant details
- [ ] Superadmin: view tenant admins list
- [ ] Client: request deposit from dashboard
- [ ] Admin: bulk import clients

## P2 - Future
- [ ] Multi-language support
- [ ] Dashboard analytics charts
- [ ] Export reports to CSV/PDF
- [ ] Email notifications
