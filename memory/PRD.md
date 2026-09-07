# Outlets USA – SaaS Personal Shopper Platform

## Original problem statement
Multi-tenant SaaS for personal shoppers: invoice/wallet sync with cascading debt, live shopping, shipments, internal banking ledgers, OCR receipt reading, client portal.

## User language
Spanish. Respond in Spanish only.

## Architecture
- Backend: FastAPI monolith `server.py` (~9,000 lines, refactor pending)
- Frontend: React + Tailwind + Shadcn UI
- DB: MongoDB (Motor async)
- OCR: Gemini Vision via Emergent LLM key

## Implemented (recent — session Feb 2026)
- **[03-feb-2026]** Fix defensivo saldo_a_favor v2: `/api/admin/clients` y `/api/wallet/{id}` ahora también hacen `$lookup` a la colección `shipments` para tomar `shipment.shipping_cost` (que es lo que usa el popup `InvoiceDialog`) en vez de `invoice.shipping_cost` cuando existe el shipment enlazado. Cierra el bug de CHOCLO donde el popup usaba $32 (real del shipment) pero mi fix anterior computaba con $64 (stale en el invoice) → daba $0 favor. Validado con escenario sintético en preview: invoice.ship=64 stale + shipment.ship=32 real + deposits=138.62 + favor_ant=3.37 + stored favor=0 → ambos endpoints devuelven `saldo_a_favor: 32.02`.
- **[03-feb-2026]** Fix defensivo saldo_a_favor: `/api/admin/clients` y `/api/wallet/{id}` ahora recomputan `saldo_a_favor`/`total_a_pagar` en on-the-fly cuando los valores agregados almacenados divergen de los campos crudos (subtotal + comisión + impuesto + envío + saldo_pendiente vs. deposits_applied + saldo_a_favor_anterior). Cierra el bug del cliente CHOCLO donde el popup mostraba $32 pero AdminClients y dashboard mostraban $0 tras el rollback a Aug-30 code. Validado en preview: forzando `saldo_a_favor=0` en la última factura, ambos endpoints devuelven el valor computado ($1036.4) sin necesidad de correr recalc manual.
- Live cantidad selector, Deudas panel fix, Manual recharge + bank ledger sync
- Top clientes saldo a favor, Inactivos tab, Granular employee perms
- pending_to_invoice global warnings, iOS PWA BFCache session fix
- Sin Tax audit report, Soft-delete recharges, Gemini OCR deposit_date extraction
- MongoDB compound indexes (31), Motor timeouts, N+1 fix
- Restore Annulled Invoices (backend + top-bar UI + password)
- **[2026-02-16] Weekly Recharge Cutoff (Cerrar semana en recargas)**:
  - Recharges assigned to invoice of same Mon–Sun America/Chicago billing week
  - Legacy recharges (created_at < 2026-02-16 Chicago) keep old logic
  - Floating recharges (no invoice in current week) absorbed by next future invoice
  - Unit tests at `/app/backend/tests/test_weekly_cutoff.py` (13 tests passing)

## Backlog / Roadmap
- **P0**: Split `server.py` into modular routers (route shadowing risk).
- **P1**: Row-level "Restaurar" button on annulled invoice rows in `AdminInvoices.jsx`.
- **P2**: Reasignar orphan purchase to active live (`InvoiceDialog.jsx`).
- **P2**: WhatsApp Integration (Twilio vs Meta Cloud API — awaiting user choice).
- **P3**: Clarify "Daños Materiales" feature from older messages.

## Key files
- `/app/backend/server.py`
- `/app/frontend/src/pages/AdminInvoices.jsx`
- `/app/frontend/src/pages/ClientDashboard.jsx`
- `/app/frontend/src/pages/AdminStats.jsx`

## Test credentials
See `/app/memory/test_credentials.md`.
