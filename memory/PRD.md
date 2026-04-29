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
- **[28-feb]** **Preview de eliminación de producto**: nuevo endpoint `GET /api/purchases/{id}/delete-preview` y `AlertDialog` en `AdminLive.jsx` que muestra antes de confirmar: producto + tienda + cliente, monto del reembolso, factura asociada (si la hay) con conteo de ítems y total antes/después, y aviso especial si es el último ítem (caja roja). Verificado E2E.
- **[28-feb]** **Recalcular factura desde el diálogo de Auditoría**: el endpoint `POST /invoices/{id}/recalc` ahora recompone también `subtotal/total_tax/total_commission/total` desde las purchases vivas, limpia ids huérfanos y luego dispara el chain. Botón "Recalcular factura" siempre visible al inicio del modal de Auditoría (caja azul). Verificado E2E corrompiendo la factura en BD: subtotal $999.99→$75, total $9999.99→$80, 1 id fantasma limpiado.
- **[28-feb]** **Cliente Revisado**: nuevo flag `reviewed` en `User`, endpoint `PUT /admin/clients/{user_id}/toggle-reviewed`, checkbox al lado de "Activo" en la lista de clientes; cuando está marcado, el nombre se resalta con fondo verde claro. Persistente entre reloads.
- **[28-feb]** **Editar envío con categorías y modo dinámico**: `ShipmentEditDialog` ahora recibe `tenantSettings` y muestra selector de categoría (G/A/B/OTHER), input dinámico de Paquetes/Libras según `shipping_mode`, y costo total auto-recalculado (editable manualmente). Backend `ShipmentUpdate` extendido con `shipping_category`, `shipping_unit_cost`, `package_count`, `tracking_numbers` (array). Verificado E2E.
- **[28-feb]** **Origen de Live en compras pendientes**: el endpoint `GET /invoices/client/{customer_id}/pending-purchases` ahora devuelve `live_title` y `live_status` enriqueciendo cada compra con el nombre del Live de origen. En el modal Nueva Factura cada compra muestra un badge violeta con icono 📡 + nombre del Live (o badge gris "Sin live" si fue registro manual). Permite distinguir productos de distintos Lives en la misma tienda. Verificado E2E.
- **[28-feb]** **Cantidad de artículos en Factura de Tienda**: nuevo campo `store_invoice_items_count: int` en el modelo Live. Endpoint `PUT /lives/{id}/store-invoice` lo acepta opcional y preserva el valor cuando solo se actualiza el monto. Frontend `StoreInvoiceSection` añade input con icono 📦 + helper "Registrados a clientes: N" comparando con `purchase_count`. Útil cuando compras 30 ítems en la tienda pero distribuyes solo 15 a clientes. Verificado E2E.
- **[28-feb]** **Diagnóstico de origen en compras pendientes**: el badge ahora distingue 3 casos (`with_live`, `deleted_live`, `no_live`) en lugar de 2. Compras de Live eliminado muestran badge ámbar "Live eliminado" con el `live_id` truncado en el tooltip. Nuevo endpoint `GET /admin/diagnose-pending/{customer_id}` que lista cada compra con su origen, fecha, monto y datos del live (cuando existe). Útil para auditar diferencias entre conteos del Live y la Factura.
- **[28-feb]** **Bug de productos LIVE duplicados — fix de race condition**: agregado guard sincrónico (`useRef`) en `handleSubmitPurchase` y `actuallySubmitPurchase` que bloquea instantáneamente segundas invocaciones cuando el usuario hace doble-click o spamea Enter. Antes el `disabled={submitting}` no protegía porque `setSubmitting(true)` ocurría asíncronamente dentro de `actuallySubmitPurchase`, dejando una ventana de race en la que el segundo evento iniciaba un `createPurchase` paralelo que duplicaba el producto. Liberación del lock en el `finally`.
- **[28-feb]** **Live ID parcial en badge violeta**: el badge de origen del Live ahora muestra `#xxxxxx` (los primeros 6 caracteres del UUID) además del título, para distinguir cuando dos Lives tienen el mismo nombre. Endpoint `POST /purchases/{id}/reassign-live` listo en backend para mover compras huérfanas a un Live activo (UI pendiente de cablear).
- **[28-feb]** **🐛 BUG MAYOR FIXEADO — Live cortaba a 500 compras**: el endpoint `GET /purchases/live/{live_id}` tenía `.to_list(500)`. Para Lives de alto volumen (ej: COSTCO con 500+) las compras más antiguas no se mostraban en la vista del Live, mientras que el modal de Factura sí las traía completas (otro endpoint distinto). Esto explicaba por qué el cliente AH8 aparecía con 6 compras en el Live COSTCO pero la factura traía 11 del mismo Live. Aumentado a `.to_list(5000)`.

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
