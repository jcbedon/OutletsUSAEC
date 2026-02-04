# OUTLETS USA EC - TikTok Live Shopping Platform

## Original Problem Statement
Web App PWA (mobile-first) para negocio de TikTok Live Shopping con:
- Wallet con recargas y descuentos automáticos
- Compras en vivo durante transmisiones de TikTok
- Envíos internacionales desde USA
- Notificaciones automáticas por WhatsApp Cloud API

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Simple authentication (email/whatsapp/customer_id + password)

## User Personas
1. **Cliente**: Compra productos de USA durante Lives de TikTok
2. **Admin**: Gestiona ventas en vivo, wallets, envíos

## Core Requirements (Static)
- ID de cliente: Letra inicial + 4 dígitos (ej: J4582)
- Comisión fija: $3 USD por compra
- Envío con familiar USA: $32 USD
- Envío sin familiar USA: $52 USD
- Umbral saldo bajo: $9 USD
- Moneda: USD

## What's Been Implemented (Feb 4, 2026)

### Backend (FastAPI)
- ✅ Auth: Registro, Login (email/whatsapp/customer_id)
- ✅ Wallet: Crear, recargar, aprobar depósitos, transacciones
- ✅ Lives: Crear, iniciar, finalizar sesiones
- ✅ Purchases: Registro rápido durante lives con comisión automática
- ✅ Shipments: Crear, tracking, estados
- ✅ Notifications: Sistema preparado para WhatsApp (MOCKED)
- ✅ Reports: Resumen de ventas, top clientes

### Frontend (React)
- ✅ Login/Register pages
- ✅ Client Dashboard (wallet, compras, historial, envíos, notificaciones)
- ✅ Admin Dashboard (stats, acciones rápidas)
- ✅ Admin Live Shopping (formulario rápido de compras)
- ✅ Admin Clients (listado con saldos)
- ✅ Admin Wallet (aprobar recargas)
- ✅ Admin Shipments (crear, tracking, estados)
- ✅ Admin Reports (resumen, top clientes, por live)

### Design
- ✅ Colores: Rojo (#DC2626) + Gris claro (#F3F4F6)
- ✅ Logo: Outlets USA EC integrado
- ✅ Mobile-first responsive
- ✅ Fuentes: Manrope (headings) + DM Sans (body)

## Prioritized Backlog

### P0 - Critical (Bloqueadores)
- [ ] WhatsApp Cloud API: Configurar credenciales cuando estén disponibles

### P1 - Important
- [ ] PWA manifest y service worker para instalación
- [ ] Validación de formularios más robusta
- [ ] Paginación en listados grandes

### P2 - Nice to Have
- [ ] Notificaciones push browser
- [ ] Exportar reportes a PDF/Excel
- [ ] Historial de ajustes de precios
- [ ] Modo offline para consultar saldo

## Next Tasks
1. Configurar WhatsApp Cloud API cuando el usuario tenga las credenciales
2. Agregar PWA manifest para instalación móvil
3. Testing E2E completo de todos los flujos
4. Optimización de rendimiento para uso en vivo
