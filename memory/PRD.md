# PRD — Outlets USA EC (Personal Shoppers SaaS)

## Problem Statement
Multi-tenant SaaS para personal shoppers con live shopping, wallets, facturación dinámica, shipments y portal de clientes.

## Personas
- Superadmin · Admin tenant · Empleado · Cliente

## Stack
- Frontend: React + Tailwind + Shadcn UI
- Backend: FastAPI + Motor (MongoDB)
- AI OCR: emergentintegrations (Gemini Vision)
- PDFs: jsPDF · Object Store: Emergent internal

## Changelog (Feb 2026)
- Inline editing purchase items + sync LIVE.
- Auto-recalculo de `saldo_a_favor` en cadenas de facturas.
- Shipments mapeados 1-a-1 a invoices.
- Toggle tenant Paquetes/Libras (Superadmin).
- Wallet recharges con Gemini Vision OCR.
- Mobile tabs con labels + QR uploads.
- PDFs unificados con breakdown de Saldo a Favor.
- Fallback message en Client Dashboard cuando IA detecta $0.
- Shipping categories con **precios independientes por modo** (packages/pounds).
- **[hoy]** PDFs:
  - Fix: contenido ya no se corta abajo cuando hay muchos items/líneas financieras (paginación con `ensureSpace`, redibujo del container en cada página, footer garantizado al final).
  - Fix: PDF siempre re-consulta la factura al backend antes de generar → si el admin quitó un ítem o editó un precio, el PDF refleja los valores correctos.
- **[hoy]** Backend `remove_item_from_invoice` y `update_purchase` ahora disparan `recalculate_client_invoices` → `total_a_pagar`, `saldo_a_favor`, `saldo_pendiente` y `applied_deposits` se actualizan automáticamente en toda la cadena.
- **[27-feb]** Envíos Pendientes: filtro semanal en formato corto (lunes 12:00 → lunes 12:00) con KPIs dinámicos.
- **[27-feb]** Clientes: botón **Mostrar/Ocultar contraseña actual** en el modal Editar Cliente.
  - Backend: nuevo campo `password_plain` en `User` + endpoint `GET /admin/clients/{user_id}/password`.
  - Se llena al crear cliente (admin o self-register) y al cambiar la contraseña.
  - Para clientes legacy (antes de esta fecha) se muestra mensaje "No disponible — restablece la contraseña".

## Roadmap
### P0 técnico
- Refactor `server.py` (5400+ líneas) → routers modulares.
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
- `/app/frontend/src/lib/invoicePDF.js`
- `/app/frontend/src/components/InvoiceDialog.jsx`
- `/app/frontend/src/pages/ClientDashboard.jsx`
- `/app/frontend/src/pages/AdminShipments.jsx`
- `/app/frontend/src/pages/AdminWallet.jsx`
- `/app/frontend/src/pages/SuperadminDashboard.jsx`
