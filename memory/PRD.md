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
- [x] **NEW: Duplicate Detection (Apr 8, 2026)** - Warns when creating client with existing WhatsApp, email, or name
- [x] **NEW: Active/Inactive Tabs (Apr 8, 2026)** - Separate views for active and disabled clients
- [x] **NEW: Inhabilitar/Habilitar Clients (Apr 8, 2026)** - Toggle client status without deleting
- [x] **NEW: Admin-only Delete (Apr 8, 2026)** - Only tenant admin can delete clients, employees blocked with 403
- [x] **NEW: Custom Client ID (Apr 8, 2026)** - Allow admins to enter custom client codes when enabled by Superadmin

### Live Shopping & Purchases
- [x] Admin: Live shopping session CRUD
- [x] Admin: Purchase registration with tax + commission calc
- [x] **Tax radio buttons**: 8.25% (Illinois), 15% (Custom), Sin Tax (Feb 22, 2026)
- [x] Admin: Edit/Delete purchases from Live module
- [x] **FIX: Edit purchase stays on same Live (Apr 8, 2026)** - Previously navigated away after saving
- [x] Commission set per-purchase (not per-client) for new purchases
- [x] Client autocomplete in Live Shopping module
- [x] Dynamic tax configuration per tenant (SuperAdmin)

### Wallet & Recharges
- [x] Admin: Wallet deposit requests + approvals with screenshot proof
- [x] Admin: Reject pending deposit requests
- [x] Admin: Global deposit history - view all deposits from all clients
- [x] Admin: Manual balance adjustment - subtract money with custom reason
- [x] **NEW: Admin: Crear Recarga Manual (Apr 8, 2026)**
  - Botón visible "Crear Recarga" en Gestión de Recargas
  - Selección de cliente obligatoria con búsqueda
  - Monto obligatorio (>0)
  - Comprobante de pago obligatorio (imagen/PDF)
  - Recarga se aprueba automáticamente
  - Actualiza wallet del cliente inmediatamente
  - Registra en módulo de auditoría (action='create_recharge')
  - Envía notificación al cliente
- [x] **NEW: Reporte de Recargas (Apr 8, 2026)**
  - Nueva pestaña "Reporte" en Gestión de Recargas
  - Comparativa Admin vs Cliente
  - Cards resumen con totales
  - Lista detallada por categoría

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
- [x] **NEW: Búsqueda y Gestión de Facturas (Apr 10, 2026)**
  - Nueva página `/admin/invoices` con búsqueda global
  - Pestañas: Activas, Anuladas, Todas
  - Búsqueda por: número de factura, nombre de cliente, email, WhatsApp, ID
  - Filtros de estado funcionan con búsqueda combinada
- [x] **NEW: Anulación de Facturas (Apr 10, 2026)**
  - Soft delete: no elimina, solo marca `is_annulled=true`
  - Registra: `annulled_at`, `annulled_by`, `annulled_by_name`
  - Las compras de la factura vuelven a estado pendiente
  - Solo admins pueden anular (employees no)
  - Registro de auditoría automático
  - Diálogo de confirmación con advertencias

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
- **`POST /api/wallet/admin-recharge` (NEW)** - Admin creates recharge directly with mandatory proof
- **`GET /api/wallet/recharge-report` (NEW)** - Report comparing admin-created vs client-requested recharges

### Superadmin Settings
- `PUT /api/superadmin/tenants/{tenant_id}/settings` - Update tenant configuration
  - `allow_custom_client_id` - Enable/disable custom client codes

### Reports Module
- `GET /api/admin/reports/summary` - Basic summary stats
- `GET /api/admin/reports/business-stats` - Comprehensive business statistics
- `GET /api/admin/reports/clients-purchases` - Client purchase reports
- `GET /api/admin/reports/all-purchases` - All purchases report
- `GET /api/admin/reports/live/{id}` - Live-specific report
- `GET /api/admin/reports/clients-debts` - **NEW** Client debts report with balance analysis

### Invoice Module (NEW - Apr 10, 2026)
- `GET /api/invoices/search` - Search invoices with filters
  - Params: `q` (search term), `status_filter` (all|active|annulled|pending|approved)
  - Searches by: invoice_number, customer_id, client name, email, whatsapp
  - Returns enriched data with client info
- `PUT /api/invoices/{id}/annul` - Annul an invoice (soft delete)
  - Admin only
  - Records: annulled_at, annulled_by, annulled_by_name
  - Reverts purchases to pending status
  - Creates audit log entry

## Key Credentials
- Superadmin: superadmin@outletsusaec.com / super123
- Admin (Outlets USA EC): admin@outletsusaec.com / admin123
- Client (Juan Perez): J2934 / client123
- Employee (Maria García): maria@outletsusaec.com / empleado123
- Tenant slug example: outlets-usa

## ✅ Verified P0 Tasks (Apr 10, 2026)
### Invoice to Shipment Flow
- [x] InvoiceDialog: "Crear Envío para esta Factura" button with navigation
- [x] SessionStorage data passing (customer_id, invoice_id, purchases)
- [x] AdminShipments: Auto-open create dialog and pre-select client/products
- [x] Backend: POST /shipments accepts invoice_id, updates invoice with shipping_cost
- [x] Invoice displays shipping info (cost, weight, tracking)

### Employee Permissions System
- [x] 9 permissions with functional checkboxes in edit dialog
- [x] Sidebar correctly filters menu items based on permissions
- [x] Admin-only items hidden from employees

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
- [ ] Backend refactoring (split server.py into routers - currently ~4000+ lines)
- [ ] InvoiceDialog.jsx refactoring (currently ~1200+ lines)

## Recently Completed (Apr 12, 2026)

### Invoice Column Format Update (Apr 12, 2026)
- [x] **UPDATED: Tabla de productos** con nuevo formato de columnas:
  - CANTIDAD | DETALLE | COSTO | TIENDA | COMISION | TOTAL
  - TOTAL por item = COSTO + COMISION (sin tax por item)
- [x] **NEW: Resumen de articulos** debajo de la tabla:
  - Total de articulos (cantidad)
  - Total Etiqueta (suma de COSTO/precios base)
  - Peso en Libras (del envio asociado)
- [x] **UPDATED: Resumen financiero** estilo imagen del usuario:
  - Subtotal (COSTO + COMISION sumados)
  - Taxes (impuestos separados)
  - Envio (costo de envio)
  - Saldo Anterior (credito del cliente si wallet balance > 0)
  - Total (Subtotal + Taxes + Envio)
  - Abonos individuales (depositos del cliente listados)
  - Total a pagar = max(0, Total - total_depositos)
- [x] **Backend**: Nuevo campo `total_deposits` en endpoint `/api/invoices/{id}` (suma de todos los depositos aprobados del cliente)
- [x] **PDF**: Actualizado con mismo formato de columnas y resumen financiero

## Recently Completed (Apr 11, 2026)

### Live Data Propagation & Confirmation Dialog (Apr 11, 2026)
- [x] **NEW: Diálogo de confirmación** al abrir un Live finalizado
  - Icono AlertTriangle con título "Live Finalizado"
  - Mensaje advirtiendo que no se pueden agregar nuevos productos
  - Botones "Cancelar" y "Sí, Abrir Live"
  - Aplica a status: `ended`, `finalized`, `completed`
- [x] **NEW: Propagación de datos del Live a compras**
  - Endpoint `PUT /api/lives/{live_id}` actualiza todas las compras asociadas
  - Cuando se cambia el título del Live → actualiza `live_title` en compras
  - Cuando se cambia la tienda → actualiza `store` en compras
  - Usa `update_many` para eficiencia en lotes
- [x] **NEW: Lives finalizados no muestran formulario de compra**
  - Tarjeta amber de advertencia en lugar del formulario
  - Botón "Reactivar Live para Agregar Productos"
  - Al reactivar, el live vuelve a status `active` y muestra el formulario

### Store Profits Report (Ganancias por Tienda)
- [x] **NEW: StoreProfitsReport component** - Componente reutilizable para mostrar ganancias por tienda
  - Tarjetas: Lives con Factura, Total Ventas, Costo Tiendas, Ganancia Total
  - Margen de ganancia promedio
  - Lista detallada por Live/Tienda con:
    - Nombre del live
    - Tienda asociada
    - Fecha
    - Cantidad de productos
    - Ventas vs Costo = Ganancia
    - Margen de ganancia (%)
    - Botón "Ver factura" para visualizar imagen de factura de tienda
  - Dialog para previsualizar imágenes de facturas
- [x] Integrado en `/admin/stats` (pestaña "Tiendas")
- [x] Integrado en `/admin/reports` (pestaña "Ganancias")
- [x] Endpoint: `GET /api/admin/reports/store-profits`

### Crear Facturas desde Módulo de Facturas (Apr 11, 2026)
- [x] **UPDATED: Flujo completo de facturación** desde `/admin/invoices`
  - Paso 1: Click "Nueva Factura" → Selector de clientes
  - Paso 2: Seleccionar cliente → Abre `InvoiceDialog` (mismo que desde Usuarios)
  - Incluye: selección de compras, cálculo de totales, creación de factura, generación PDF
- [x] Eliminado `CreateInvoiceDialog.jsx` (reemplazado por `InvoiceDialog`)
- [x] Recarga automática de lista después de cerrar diálogo

### Flujo Mejorado de Envíos - Desde Factura (Apr 11, 2026)
- [x] **NEW: Origen de productos** - Toggle entre "Compras Pendientes" y "Desde Factura"
- [x] **NEW: Selección de factura** - Muestra facturas sin envío del cliente
- [x] **NEW: Endpoint** `GET /api/invoices/client/{customer_id}/for-shipment`
  - Filtra facturas que NO tienen envío asociado
  - Incluye purchases detallados
- [x] Al seleccionar factura, auto-selecciona sus productos
- [x] Vincula invoice_id al crear el envío

### Bug Fixes (Apr 11, 2026)
- [x] **FIX: Dialog de imagen no usado en AdminStats.jsx** - Eliminado código muerto que causaba error de `selectedImage` indefinido
- [x] **FIX: Logo desapareciendo** - Implementado logo por defecto consistente en todas las páginas admin:
  - `AdminStats.jsx` - Añadido DEFAULT_LOGO fallback
  - `AdminReports.jsx` - Añadido DEFAULT_LOGO fallback  
  - `AdminClients.jsx` - Añadido DEFAULT_LOGO fallback
  - Eliminadas condiciones `{logoUrl && ...}` que ocultaban el logo cuando era vacío

### UI Improvements - AdminInvoices (Apr 11, 2026)
- [x] **Header con logo** en página de Gestión de Facturas (`/admin/invoices`)
- [x] **Botón "Nueva Factura" más visible** - Movido al header en verde brillante
- [x] Navegación con botón de volver al dashboard

### Bug Fix - Envío vinculado incorrectamente a factura (Apr 11, 2026)
- [x] **CRITICAL FIX:** Las facturas ya NO muestran el envío del último envío del cliente
- [x] Ahora solo se muestra el envío específicamente vinculado a esa factura (`invoice_id`)
- [x] Modificado endpoint `GET /api/invoices/{invoice_id}` para buscar por `invoice_id` en lugar de `customer_id`

### UI Improvements - AdminShipments (Apr 11, 2026)
- [x] **Scroll wheel deshabilitado** en campos numéricos (costo, peso) en diálogos de crear/editar envío
- [x] Agregado `onWheel={(e) => e.target.blur()}` a todos los inputs `type="number"`

## Recently Completed (Apr 2026)

### Employee Management Module
- [x] CRUD de empleados con permisos granulares
- [x] 9 permisos disponibles como checkboxes visuales:
  - manage_clients, manage_purchases, manage_lives
  - approve_recharges, manage_shipments, manage_invoices
  - view_reports, adjust_wallet, view_statistics
- [x] Estado activo/inactivo con switch
- [x] Contraseña visible para el admin (texto plano almacenado)
- [x] Login de empleados con validación de permisos
- [x] UI moderna con gradientes indigo/púrpura

### Audit Log System
- [x] Registro completo de acciones de admin y empleados
- [x] Filtros por usuario, acción, fecha
- [x] Acciones rastreadas: login, CRUD clientes, compras, recargas, facturas, envíos, empleados
- [x] Vista detallada con JSON expandible

### Client Debts Dashboard (Apr 6, 2026)
- [x] **NEW: Panel de Deudas de Clientes** - Nueva pestaña en Estadísticas
  - Tarjetas resumen: Total Clientes, Con Deuda, Sin Deuda, Deuda Total
  - Gráfico de barras "Balance por Cliente" (rojo = debe, verde = a favor)
  - Gráfico pie "Distribución" de clientes con/sin deuda
  - Gráfico combinado "Clientes por Mes de Registro" (barras + línea de deuda)
  - Tabla detallada con: Cliente, ID, Fecha registro, Wallet, Envíos, Balance
  - Endpoint: `GET /api/admin/reports/clients-debts`
