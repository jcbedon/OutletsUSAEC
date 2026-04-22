# PRD — Outlets USA EC (Personal Shoppers SaaS)

## Problem Statement
Multi-tenant SaaS para personal shoppers con live shopping, wallets, facturación dinámica, shipments y portal de clientes.

## Personas
- Superadmin (plataforma) · Admin tenant · Empleado · Cliente

## Stack
- Frontend: React + Tailwind + Shadcn UI
- Backend: FastAPI + Motor (MongoDB)
- AI OCR: `emergentintegrations` (Gemini Vision vía EMERGENT_LLM_KEY)
- PDFs: jsPDF · Object Store: Emergent internal

## Changelog (Feb 2026)
- Inline editing de purchase items (pending) con sync a LIVE.
- Auto-recalculo de `saldo_a_favor` en cadenas de facturas + botón manual.
- Shipments mapeados 1-a-1 a invoices vía `invoice_id`.
- Toggle tenant Paquetes/Libras desde Superadmin.
- Wallet Recharges overhaul con Gemini Vision OCR automático.
- Mobile tabs del Client Portal con labels.
- QR upload sessions para adjuntos de shipments.
- PDFs unificados con breakdown de Saldo a Favor.
- Fallback message en Client Dashboard cuando IA detecta $0.
- **[hoy]** Shipping categories con **precios independientes por modo**: cada categoría G/A/B guarda `value_packages` y `value_pounds` separadamente. Al cambiar uno no afecta el otro. Retro-compatible con campo legacy `value`.

## Roadmap
### P0 técnico
- 🚨 Refactor `server.py` (5387 líneas) → routers modulares.
- Refactor `InvoiceDialog.jsx` (~1500 líneas).

### P1
- Email notifications facturas/shipments.
- Validar vista de facturas Anuladas (E2E test pending).

### P2
- WhatsApp Cloud API · PWA instalable.

### P3
- AI OCR confidence indicator en Admin Wallet.

## Known Env Issues
- Object Store falla al init en preview; OK en producción.

## Key Files
- `/app/backend/server.py`
- `/app/frontend/src/pages/ClientDashboard.jsx`
- `/app/frontend/src/pages/AdminShipments.jsx`
- `/app/frontend/src/pages/AdminWallet.jsx`
- `/app/frontend/src/pages/SuperadminDashboard.jsx`
- `/app/frontend/src/components/InvoiceDialog.jsx`
- `/app/frontend/src/lib/invoicePDF.js`
