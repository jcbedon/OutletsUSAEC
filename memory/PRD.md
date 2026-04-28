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
- **[27-feb]** Backend: `NoCacheMiddleware` agregado antes de `CORSMiddleware` → todas las respuestas `/api/*` traen `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`.
- **[27-feb]** **Permisos de empleado en vivo VERIFICADO**: `/auth/me` devuelve permisos frescos para empleado y admin; al refrescar la página, la UI hidrata las nuevas tarjetas (Facturas/Envíos) sin re-login. Confirmado E2E con screenshots.
- **[28-feb]** **Auto-refresh on tab focus**: nuevo hook `useRefreshOnTabFocus` cableado a las 12 páginas principales (AdminDashboard, AdminStats, AdminLive, AdminShipments, AdminWallet, AdminInvoices, AdminClients, AdminEmployees, AdminAuditLog, AdminReferrals, ClientDashboard, SuperadminDashboard). Cuando el usuario regresa a la pestaña, la página recarga su data automáticamente. Verificado E2E disparando `visibilitychange` (pasó de 4 → 6 fetches a `/api/admin/clients`).
- **[28-feb]** **Audit + Historial**:
  - `delete_purchase` ahora registra audit log con snapshot completo (cliente, tienda, live, ítem, monto, quién eliminó). Se guarda **antes** del delete para preservar el contexto.
  - Eventos `login` ocultos del feed de auditoría (siguen en BD para forensics).
  - Nueva pestaña **Historial** en `/admin/audit`: 3 secciones (Productos Eliminados, Facturas Anuladas, Recargas Aprobadas) con rango 7/14/30/60/90 días, KPIs y filtro de texto unificado. Para deletes anteriores al fix se muestra un fallback desde `wallet_transactions` tipo refund (etiquetado `legacy`, sin tienda/live).
  - Endpoint `GET /admin/audit-logs/history?days=N`.
- **[28-feb]** **Restaurar producto eliminado**: endpoint `POST /admin/audit-logs/restore-purchase/{audit_log_id}` que recrea el `purchase` desde el snapshot, revierte el reembolso (`wallet_transactions` is_deleted + `wallets.available -= amount`), restaura totales del live y dispara `recalculate_client_invoices`. Marca el audit log original como `restored=true` para evitar doble-restore. Verificado E2E: balance vuelve a su estado original ($17.24 → $99.74 → $17.24).
- **[28-feb]** **`delete_purchase` ahora actualiza la factura asociada**: si el producto pertenece a una factura, se quita del `purchase_ids`, se recalculan `subtotal/total_tax/total_commission/total` (mismo patrón que `remove_item_from_invoice`) y se llama a `recalculate_client_invoices` para mantener saldos consistentes en toda la cadena. Verificado E2E: factura 2-items → eliminar 1 → factura queda con 1-item, totales correctos, saldo a favor del cliente actualizado.

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
