# Outlets USA EC - Personal Shopper SaaS Platform

## Original Problem Statement
SaaS platform for personal shoppers with multi-tenancy, live shopping, wallets, shipments, invoices, and client management.

## Core Requirements
1. **Invoice & Wallet Synchronization**: Invoices reflect specific deposits without duplicating. Saldo Pendiente carries over automatically.
2. **File Storage**: All uploads persist via Emergent Object Store.
3. **Client Portal**: Clients see debt, deposits, weekly-grouped purchase history, downloadable PDF invoices.
4. **Stats & Metrics**: Weekly filters (Tuesday 00:00 – Monday 23:59) for sales, commissions, shipping, packages.
5. **Language**: Spanish UI.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) — `/app/backend/server.py` (monolith ~4700 lines, pending refactor).
- **Frontend**: React + Tailwind + Shadcn UI.
- **Integrations**: Emergent Object Store, jsPDF (frontend), QRCode.

## Key Business Rules
- **Weekly windows**: Tuesday 00:00 → Monday 23:59 everywhere.
- **Deposits**: A recarga is NEVER split. It applies entirely to the latest active invoice. Excess becomes `saldo_a_favor` carried to next invoice.
- **Saldo Pendiente**: Strictly the `total_a_pagar` from the previous invoice. Auto-filled, locked except for first invoice.

## Implemented (Recent Changelog)
### Feb 2026 — Current Session
- [Feb 21] **Inline edit of pending purchases in Invoice Dialog**: Admin can edit item name, store, price, tax option, and commission directly from the "Nueva Factura" view. Changes call `PUT /api/purchases/{id}` and propagate automatically to LIVE view (single source of truth). Verified E2E.

### Prior Session
- Invoice weekly grouping (Tue–Mon).
- Dashboard uniform cards + weekly filters for Sales/Commissions/Shipping/Packages/Clients.
- "Compraron" (Buyers) drill-down report.
- Deposit carry-over logic (non-split, `saldo_a_favor` / `saldo_pendiente`).
- `/api/admin/recalculate-all-invoices` for recomputing production data.
- Client Portal: Tabs "Pendientes de facturar" + "Historial" (invoiced).
- Admin Live: Top list of clients that bought during live, with "reviewed" toggle.
- Shipments: Manual `package_count`, fixed "Crear Envío" button disappearing.
- Annulled invoices: Read-only view with "ANULADA" badge (frontend verified via screenshot flow).
- PDF invoice redesign (SaaS aesthetic, QR to client portal).

## Key API Endpoints
- `POST /api/admin/recalculate-all-invoices`
- `GET /api/admin/reports/buyers`
- `PUT /api/purchases/{purchase_id}` — used by both LIVE edit and invoice-dialog inline edit.
- `GET /api/invoices/{invoice_id}` — fetches purchases live from `purchases` collection.

## Pending / Backlog
### P1
- Email notifications for invoices & shipments (Resend/SendGrid TBD).
### P2
- WhatsApp Cloud API integration.
- PWA setup for mobile install.
### P0 Technical Debt
- Refactor `/app/backend/server.py` into modular routers (`routers/invoices.py`, `routers/wallet.py`, `routers/purchases.py`, etc.).
- Split `/app/frontend/src/components/InvoiceDialog.jsx` (~1750 lines) into smaller subcomponents.

## Credentials
See `/app/memory/test_credentials.md`.
