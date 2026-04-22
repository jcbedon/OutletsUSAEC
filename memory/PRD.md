# PRD — Outlets USA EC (Personal Shoppers SaaS)

## Problem Statement
Multi-tenant SaaS para personal shoppers con live shopping, wallets, facturación dinámica, shipments y portal de clientes. Énfasis en:
1. **Invoice & Wallet Sync** — deposits trackean correctamente saldo a favor / saldo pendiente a través de cadenas de facturas.
2. **Shipments** — cálculo flexible (por paquetes o libras) con categorías G/A/B por tenant, mapeados 1-a-1 con invoice.
3. **Client Portal + AI OCR** — clientes suben comprobantes; Gemini Vision extrae monto automáticamente.
4. **Storage & Workflows** — QR uploads móviles para adjuntos, PDFs unificados.

## Personas
- Superadmin (plataforma)
- Admin tenant
- Empleado
- Cliente

## Stack
- Frontend: React + Tailwind + Shadcn UI
- Backend: FastAPI + Motor (MongoDB)
- AI OCR: `emergentintegrations` (Gemini Vision vía EMERGENT_LLM_KEY)
- PDFs: jsPDF
- Object Store: Emergent internal

## Changelog (Feb 2026)
- **2026-02-XX**: Inline editing de purchase items en facturas pending, auto-sync a LIVE.
- **2026-02-XX**: Auto-recalculo de `saldo_a_favor` en cadenas de facturas + botón manual "Recalcular" en Admin.
- **2026-02-XX**: Shipments mapeados estrictamente por `invoice_id`. Toggle tenant packages/pounds desde Superadmin.
- **2026-02-XX**: Wallet Recharges overhaul — cliente sube proof + referencia; admin revisa.
- **2026-02-XX**: Gemini Vision OCR integrado — detecta monto automáticamente desde comprobante y proyecta nuevo saldo.
- **2026-02-XX**: Mobile tabs del Client Portal con labels visibles.
- **2026-02-XX**: QR upload sessions para adjuntos de shipments.
- **2026-02-XX**: PDFs unificados con breakdown de Saldo a Favor.
- **2026-02-XX (hoy)**: Fallback message en Client Dashboard cuando la IA detecta $0 o el admin aún no asigna monto: *"Tu depósito está siendo procesado y verificado por nuestro equipo. Cuando se apruebe, tu nuevo saldo aparecerá aquí."*

## Roadmap
### P0
- 🚨 **Refactor backend `server.py`** (5300+ líneas) → routers modulares.
- Refactor `InvoiceDialog.jsx` (~1500 líneas).

### P1
- Email notifications para facturas y shipments.
- Validar vista de facturas Anuladas (clickeable + badge ANULADA) — código existe, pendiente E2E test.

### P2
- WhatsApp Cloud API integration.
- PWA instalable.

### P3
- AI OCR confidence indicator (low/med/high) en Admin Wallet.

## Known Env Issues
- Object Store falla al inicializar en preview (funciona en producción). Safe to bypass.

## Key Files
- `/app/backend/server.py` — monolith
- `/app/frontend/src/pages/ClientDashboard.jsx`
- `/app/frontend/src/pages/AdminShipments.jsx`
- `/app/frontend/src/pages/AdminWallet.jsx`
- `/app/frontend/src/pages/SuperadminDashboard.jsx`
- `/app/frontend/src/components/InvoiceDialog.jsx`
- `/app/frontend/src/lib/invoicePDF.js`
