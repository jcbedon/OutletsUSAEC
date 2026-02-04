# OUTLETS USA EC - TikTok Live Shopping Platform

## Original Problem Statement
Web App PWA (mobile-first) para negocio de TikTok Live Shopping con:
- Wallet con recargas y descuentos automáticos
- Compras en vivo durante transmisiones de TikTok
- Envíos internacionales desde USA (precio configurable)
- Notificaciones automáticas por WhatsApp Cloud API
- Sistema de referidos con bonos configurables

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Simple authentication (email/whatsapp/customer_id + password)

## User Personas
1. **Cliente**: Compra productos de USA durante Lives de TikTok
2. **Admin**: Gestiona ventas en vivo, wallets, envíos, referidos

## Core Requirements (Static)
- ID de cliente: Letra inicial + 4 dígitos (ej: J4582)
- Comisión fija: $3 USD por compra
- Umbral saldo bajo: $9 USD
- Moneda: USD

## What's Been Implemented (Feb 4, 2026)

### Backend (FastAPI)
- ✅ Auth: Registro, Login (email/whatsapp/customer_id)
- ✅ Wallet: Crear, recargar, aprobar depósitos, transacciones
- ✅ Lives: Crear, iniciar, finalizar sesiones
- ✅ Purchases: Registro rápido durante lives con comisión automática
- ✅ Shipments: Crear con precio personalizable, tracking, estados
- ✅ Referrals: Código de referido, bonos configurables por admin
- ✅ Notifications: Sistema preparado para WhatsApp (MOCKED)
- ✅ Reports: Resumen de ventas, top clientes, estadísticas referidos

### Frontend (React)
- ✅ Login/Register pages (con campo de código referido)
- ✅ Client Dashboard (wallet, compras, historial, envíos, notificaciones)
- ✅ **Botón "Invita y Gana"** - Compartir por WhatsApp
- ✅ Admin Dashboard (stats, acciones rápidas)
- ✅ Admin Live Shopping (formulario rápido de compras)
- ✅ Admin Clients (listado con saldos)
- ✅ Admin Wallet (aprobar recargas)
- ✅ Admin Shipments (crear con precio personalizado, tracking, estados)
- ✅ **Admin Referidos** - Configurar bono de referido
- ✅ Admin Reports (resumen, top clientes, por live)

### Nuevas Funcionalidades (Fase 2)
- ✅ **Sistema de Referidos**: Ambos (referidor y nuevo cliente) reciben bono
- ✅ **Bono Configurable**: Admin define cuánto dar por referido ($0 desactiva)
- ✅ **Precio de Envío Flexible**: Admin escribe el precio que desee por cada cliente

### Design
- ✅ Colores: Rojo (#DC2626) + Gris claro (#F3F4F6)
- ✅ Logo: Outlets USA EC integrado
- ✅ Mobile-first responsive
- ✅ Fuentes: Manrope (headings) + DM Sans (body)

## Prioritized Backlog

### P0 - Critical
- [ ] WhatsApp Cloud API: Configurar credenciales cuando estén disponibles

### P1 - Important
- [ ] PWA manifest y service worker para instalación
- [ ] Validación de formularios más robusta

### P2 - Nice to Have
- [ ] Notificaciones push browser
- [ ] Exportar reportes a PDF/Excel

## Next Tasks
1. Configurar WhatsApp Cloud API cuando el usuario tenga las credenciales
2. Agregar PWA manifest para instalación móvil
