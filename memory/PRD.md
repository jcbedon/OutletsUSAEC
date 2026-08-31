# Outlets USA – SaaS Personal Shopper Platform

## Original problem statement
Multi-tenant SaaS for personal shoppers: invoice/wallet sync with cascading debt, live shopping, shipments, internal banking ledgers, OCR receipt reading, client portal. User language: Spanish.

## Architecture
- Backend: FastAPI monolith `server.py` (~9,400 lines — refactor pending)
- Frontend: React + Tailwind + Shadcn UI
- DB: MongoDB (Motor async, 33 compound indexes)
- OCR: Gemini Vision via Emergent LLM key

## Implemented (Feb 2026 session)
- **Weekly Recharge Cutoff** (Feb 16 2026 America/Chicago): recharges assigned to invoice of same Mon–Sun billing week. Legacy recharges untouched. Floating recharges absorbed by next future invoice. 13 pytest cases.
- **Real Pending Balance**: `/api/admin/clients` now returns `pending_to_invoice` as $$ (was count), plus `pending_to_invoice_count` and `real_pending_balance` combining last invoice debt + unbilled purchase $. Frontend shows "Deuda Total" (rojo) in AdminLive, AdminClients, AdminInvoices, AdminStats with tooltip breakdown.
- **OCR Anti-Fraud on Deposit Upload**: OCR runs BEFORE insert. Blocks (a) client-typed ref ≠ OCR-detected ref (400) and (b) same image reused with different ref (409). Added `ai_detected_reference_lower` index. Retro-active admin endpoint `/api/admin/deposits/detect-duplicates?scan_missing=[bool]` groups deposits by OCR reference. UI button "Detectar Duplicados" in AdminWallet.
- **History Truncation Fix**: raised limits on per-client history endpoints (100/50 → 5000) that were hiding old months of data (bug reported for L5L missing April/May 2025). Added ownership guards (403 if client requests another user's data).
- **Client Diagnostics Endpoint**: `GET /api/admin/clients/{customer_id}/diagnostics` returns raw counts + monthly buckets + case-insensitive parity for invoices/purchases/wallet/shipments. UI button "Diagnóstico" (teal) in AdminClients row.
- **AdminShipments getWeekKey hoisted** to module scope (fix lint scope error). Courier PDF label built from filter key directly.

## Backlog / Roadmap
- **P0**: Split `server.py` into modular routers (route shadowing risk).
- **P1**: Row-level "Restaurar" button on annulled invoice rows in AdminInvoices.
- **P1**: EMERGENT_LLM_KEY & object storage missing in preview env → OCR anti-fraud validated logic-wise but not against a real image. Confirm env before prod deploy.
- **P2**: Reasignar orphan purchase to active live (InvoiceDialog).
- **P2**: WhatsApp Integration (Twilio vs Meta — awaiting user choice).
- **P3**: "Daños Materiales" clarification.

## Key endpoints (recent)
- `GET /api/admin/clients/{customer_id}/diagnostics` — history debug
- `POST /api/admin/deposits/detect-duplicates?scan_missing=[bool]` — retro OCR
- `POST /api/wallet/deposit-request-with-proof` — anti-fraud OCR pre-insert

## Test credentials
See `/app/memory/test_credentials.md`.

## Recent test reports
- `iteration_17.json` — diagnostics endpoint + UI (backend 100%, frontend 80%)
- `iteration_16.json` — truncation fixes + IDOR (88% → all fixed)
- `iteration_15.json` — OCR anti-fraud (93%)
- `iteration_14.json` — real_pending_balance
