"""
Seed test data for the Outlets USA EC tenant.

Generates a realistic dataset for QA / manual testing:
  * 100 clientes (password "123") with their wallets
  * 4 weekly lives (last month) with realistic stores
  * ~2400 purchases distributed across the 4 lives
  * Recargas aprobadas (so wallets don't all turn negative)
  * Invoices: half pending, half approved
  * Shipments for some approved invoices

Target volume: ~$30k/week in product sales, $120k/month, mixed $3/$4 commissions.

USAGE:
  cd /app/backend && python3 ../scripts/seed_test_data.py
"""
import os
import sys
import random
import uuid
import hashlib
from datetime import datetime, timezone, timedelta

# Make sure we load the backend env first
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

import asyncio  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from faker import Faker  # noqa: E402

# ─── Configuration ──────────────────────────────────────────────────────────
TENANT_ID = "44f368aa-96cc-46b0-b5ca-319a125c992e"  # Outlets USA EC (preview)
TENANT_NAME = "Outlets USA EC"
N_CLIENTS = 100
N_LIVES = 4               # weekly lives covering last month
N_PURCHASES_PER_LIVE = 600
PASSWORD_PLAIN = "123"
DEFAULT_TAX_RATE = 0.0825
COMMISSION_CHOICES = [3.0, 4.0]
STORES = ["Ross", "Marshalls", "TJ Maxx", "Burlington", "Target", "Nordstrom Rack", "Macy's", "Saks Off 5th"]
ITEMS = [
    "Vestido", "Blusa", "Pantalón", "Jean", "Zapatos", "Sneakers", "Bolso", "Cartera",
    "Perfume", "Maquillaje", "Camisa", "Chaqueta", "Falda", "Short", "Top", "Suéter",
    "Reloj", "Anteojos", "Gorra", "Set de ropa", "Pijama", "Sandalias", "Botas", "Mochila",
]


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def gen_customer_id(name: str, taken: set) -> str:
    letter = (name[0] if name else "X").upper()
    while True:
        cid = f"{letter}{random.randint(1000, 9999)}"
        if cid not in taken:
            taken.add(cid)
            return cid


def iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc if dt.tzinfo is None else dt.tzinfo).isoformat()


async def main():
    fake = Faker("es_ES")
    Faker.seed(42)
    random.seed(42)

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Sanity check the tenant exists.
    tenant = await db.tenants.find_one({"id": TENANT_ID}, {"_id": 0, "id": 1, "business_name": 1})
    if not tenant:
        print(f"ERROR: Tenant {TENANT_ID} no encontrado en la BD.")
        return
    print(f"✓ Sembrando datos en tenant: {tenant['business_name']}")

    # ─── Step 1: CLIENTS ────────────────────────────────────────────────────
    existing_cids = set([u["customer_id"] for u in await db.users.find(
        {"tenant_id": TENANT_ID, "role": "client"}, {"_id": 0, "customer_id": 1}).to_list(5000)])
    pwd_hash = hash_password(PASSWORD_PLAIN)
    now = datetime.now(timezone.utc)

    new_clients = []
    new_wallets = []
    for i in range(N_CLIENTS):
        name = fake.name()
        cid = gen_customer_id(name, existing_cids)
        uid = str(uuid.uuid4())
        created_offset = random.randint(20, 365)
        created_at = (now - timedelta(days=created_offset)).isoformat()
        whatsapp = f"+593{random.randint(900000000, 999999999)}"
        new_clients.append({
            "id": uid,
            "tenant_id": TENANT_ID,
            "customer_id": cid,
            "referral_code": "",
            "name": name,
            "country": random.choice(["Ecuador", "Estados Unidos", "Colombia"]),
            "whatsapp": whatsapp,
            "email": f"{cid.lower()}@test.com",
            "whatsapp_consent": True,
            "password_hash": pwd_hash,
            "password_plain": PASSWORD_PLAIN,
            "role": "client",
            "is_active": True,
            "reviewed": False,
            "commission_fee": 3.0,
            "created_at": created_at,
        })
        new_wallets.append({
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "user_id": uid,
            "customer_id": cid,
            "available": 0.0,
            "reserved": 0.0,
            "pending_adjustment": 0.0,
            "updated_at": created_at,
        })
    await db.users.insert_many(new_clients)
    await db.wallets.insert_many(new_wallets)
    print(f"✓ {len(new_clients)} clientes + wallets creados (password=\"{PASSWORD_PLAIN}\")")

    # Build a quick lookup
    clients_lookup = [{"id": c["id"], "customer_id": c["customer_id"], "name": c["name"]} for c in new_clients]

    # ─── Step 2: RECARGAS APROBADAS ─────────────────────────────────────────
    # Each client gets 1-4 recharges between $100 and $500. This funds the
    # wallets so subsequent purchases don't drive them too far negative.
    recharges = []
    wallet_balances = {c["id"]: 0.0 for c in clients_lookup}
    for c in clients_lookup:
        n_recharges = random.randint(1, 4)
        for _ in range(n_recharges):
            amt = round(random.uniform(100, 500), 2)
            created_at = (now - timedelta(days=random.randint(1, 30), hours=random.randint(0, 23))).isoformat()
            wallet_balances[c["id"]] += amt
            recharges.append({
                "id": str(uuid.uuid4()),
                "tenant_id": TENANT_ID,
                "user_id": c["id"],
                "customer_id": c["customer_id"],
                "type": "deposit",
                "amount": amt,
                "balance_after": round(wallet_balances[c["id"]], 2),
                "description": "Recarga creada por administrador (seed)",
                "status": "approved",
                "created_at": created_at,
                "approved_at": created_at,
                "created_by_admin": True,
            })
    await db.wallet_transactions.insert_many(recharges)
    print(f"✓ {len(recharges)} recargas aprobadas creadas (total ${sum(r['amount'] for r in recharges):.2f})")

    # ─── Step 3: LIVES (4 semanales) ────────────────────────────────────────
    lives = []
    for w in range(N_LIVES):
        # Each live ends `w` weeks ago (week 0 = current, week 3 = 3 weeks ago)
        end = now - timedelta(weeks=N_LIVES - 1 - w, days=random.randint(0, 2))
        start = end - timedelta(hours=random.randint(2, 6))
        live = {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "title": f"Live Semana {w + 1} — {fake.month_name() if hasattr(fake, 'month_name') else end.strftime('%b')}",
            "store": random.choice(STORES),
            "status": "ended",
            "created_at": start.isoformat(),
            "started_at": start.isoformat(),
            "ended_at": end.isoformat(),
            "total_sales": 0.0,
            "total_commissions": 0.0,
            "purchase_count": 0,
        }
        lives.append(live)
    await db.lives.insert_many(lives)
    print(f"✓ {len(lives)} lives creados")

    # ─── Step 4: PURCHASES ──────────────────────────────────────────────────
    purchases = []
    purchase_txs = []  # wallet "purchase" transactions
    for live in lives:
        for _ in range(N_PURCHASES_PER_LIVE):
            c = random.choice(clients_lookup)
            price = round(random.uniform(25, 65), 2)
            commission = random.choice(COMMISSION_CHOICES)
            tax = round(price * DEFAULT_TAX_RATE, 2)
            price_with_tax = round(price + tax, 2)
            total = round(price_with_tax + commission, 2)
            # Random time during the live window
            start_dt = datetime.fromisoformat(live["started_at"].replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(live["ended_at"].replace("Z", "+00:00"))
            secs = max(1, int((end_dt - start_dt).total_seconds()))
            created_dt = start_dt + timedelta(seconds=random.randint(0, secs))
            pid = str(uuid.uuid4())
            purchases.append({
                "id": pid,
                "tenant_id": TENANT_ID,
                "user_id": c["id"],
                "customer_id": c["customer_id"],
                "item_name": random.choice(ITEMS),
                "store": live["store"],
                "price": price,
                "tax": tax,
                "price_with_tax": price_with_tax,
                "commission": commission,
                "total": total,
                "status": "confirmed",
                "live_id": live["id"],
                "created_at": created_dt.isoformat(),
            })
            # Update lives aggregates
            live["total_sales"] = round(live["total_sales"] + price_with_tax, 2)
            live["total_commissions"] = round(live["total_commissions"] + commission, 2)
            live["purchase_count"] += 1
            # Update wallet balance (deduct purchase total)
            wallet_balances[c["id"]] = round(wallet_balances[c["id"]] - total, 2)
            purchase_txs.append({
                "id": str(uuid.uuid4()),
                "tenant_id": TENANT_ID,
                "user_id": c["id"],
                "customer_id": c["customer_id"],
                "type": "purchase",
                "amount": -total,
                "balance_after": wallet_balances[c["id"]],
                "description": f"Compra: {purchases[-1]['item_name']} - {live['store']}",
                "status": "completed",
                "created_at": created_dt.isoformat(),
                "purchase_id": pid,
            })

    # Insert in batches
    BATCH = 500
    for i in range(0, len(purchases), BATCH):
        await db.purchases.insert_many(purchases[i:i + BATCH])
    for i in range(0, len(purchase_txs), BATCH):
        await db.wallet_transactions.insert_many(purchase_txs[i:i + BATCH])

    # Sync the lives aggregates we mutated
    for live in lives:
        await db.lives.update_one({"id": live["id"]}, {"$set": {
            "total_sales": live["total_sales"],
            "total_commissions": live["total_commissions"],
            "purchase_count": live["purchase_count"],
        }})
    total_sales = sum(live["total_sales"] for live in lives)
    print(f"✓ {len(purchases)} purchases creados — ventas totales ${total_sales:,.2f} (~${total_sales/N_LIVES:,.2f}/semana)")

    # Final wallet balances
    for c in clients_lookup:
        await db.wallets.update_one(
            {"user_id": c["id"], "tenant_id": TENANT_ID},
            {"$set": {"available": wallet_balances[c["id"]], "updated_at": now.isoformat()}}
        )

    # ─── Step 5: INVOICES (algunas pendientes, otras aprobadas) ─────────────
    # Group purchases by (customer_id, live_id) and create one invoice per group
    # for ~70% of customers. That's roughly realistic.
    from collections import defaultdict
    groups = defaultdict(list)
    for p in purchases:
        groups[(p["customer_id"], p["live_id"])].append(p)

    invoices = []
    invoice_purchases_to_update = []  # (purchase_id, invoice_id)
    # Sequential invoice number
    seq = 1000
    for (cid, live_id), items in groups.items():
        if random.random() > 0.6:  # only invoice ~60% of groups
            continue
        approved = random.random() < 0.5
        subtotal = round(sum(p["price"] for p in items), 2)
        total_tax = round(sum(p["tax"] for p in items), 2)
        total_commission = round(sum(p["commission"] for p in items), 2)
        total = round(subtotal + total_tax + total_commission, 2)
        inv_id = str(uuid.uuid4())
        seq += 1
        created_dt = datetime.fromisoformat(items[-1]["created_at"].replace("Z", "+00:00")) + timedelta(hours=random.randint(1, 36))
        invoices.append({
            "id": inv_id,
            "tenant_id": TENANT_ID,
            "user_id": items[0]["user_id"],
            "customer_id": cid,
            "invoice_number": f"INV-{seq}",
            "purchase_ids": [p["id"] for p in items],
            "subtotal": subtotal,
            "total_tax": total_tax,
            "total_commission": total_commission,
            "total": total,
            "saldo_pendiente": 0,
            "saldo_a_favor_anterior": 0,
            "saldo_a_favor": 0,
            "total_a_pagar": 0 if approved else total,
            "status": "approved" if approved else "pending",
            "is_annulled": False,
            "created_at": created_dt.isoformat(),
            "approved_at": (created_dt + timedelta(hours=1)).isoformat() if approved else None,
        })
        for p in items:
            invoice_purchases_to_update.append((p["id"], inv_id))

    if invoices:
        await db.invoices.insert_many(invoices)
        # Mark purchases as invoiced
        from pymongo import UpdateOne
        ops = [UpdateOne({"id": pid}, {"$set": {"invoice_id": iid, "invoiced_at": now.isoformat()}}) for pid, iid in invoice_purchases_to_update]
        for i in range(0, len(ops), BATCH):
            await db.purchases.bulk_write(ops[i:i + BATCH], ordered=False)
    approved_count = sum(1 for i in invoices if i["status"] == "approved")
    print(f"✓ {len(invoices)} facturas creadas ({approved_count} aprobadas, {len(invoices) - approved_count} pendientes)")

    # ─── Step 6: SHIPMENTS (for some approved invoices) ─────────────────────
    shipments = []
    cats = ["G", "A", "B"]
    unit_costs = {"G": 32.0, "A": 42.0, "B": 52.0}
    approved_invs = [i for i in invoices if i["status"] == "approved"]
    for inv in random.sample(approved_invs, min(len(approved_invs), 80)):
        cat = random.choice(cats)
        pkg = random.randint(1, 4)
        unit_cost = unit_costs[cat]
        shipping_cost = round(unit_cost * pkg, 2)
        created_dt = datetime.fromisoformat(inv["created_at"].replace("Z", "+00:00")) + timedelta(days=random.randint(1, 5))
        shipments.append({
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "user_id": inv["user_id"],
            "customer_id": inv["customer_id"],
            "purchase_ids": inv["purchase_ids"],
            "invoice_id": inv["id"],
            "shipping_category": cat,
            "shipping_unit_cost": unit_cost,
            "shipping_cost": shipping_cost,
            "shipping_mode": "packages",
            "package_count": pkg,
            "address": fake.address().replace("\n", ", "),
            "country": "Ecuador",
            "phone": f"+593{random.randint(900000000, 999999999)}",
            "tracking_numbers": [f"TRK{random.randint(100000, 999999)}"],
            "status": random.choice(["pending", "in_transit", "delivered"]),
            "created_at": created_dt.isoformat(),
        })
    if shipments:
        await db.shipments.insert_many(shipments)
    print(f"✓ {len(shipments)} envíos creados")

    # ─── Summary ────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"SEED COMPLETO PARA: {tenant['business_name']}")
    print("=" * 60)
    print(f"Clientes:    {len(new_clients)} (password=\"{PASSWORD_PLAIN}\")")
    print(f"Recargas:    {len(recharges)} aprobadas — ${sum(r['amount'] for r in recharges):,.2f}")
    print(f"Lives:       {len(lives)} semanales")
    print(f"Compras:     {len(purchases)} — ventas totales ${total_sales:,.2f}")
    print(f"Comisiones:  ${sum(live['total_commissions'] for live in lives):,.2f}")
    print(f"Facturas:    {len(invoices)} ({approved_count} aprobadas)")
    print(f"Envíos:      {len(shipments)}")
    print("=" * 60)
    print(f"Ejemplo de login cliente: identifier={clients_lookup[0]['customer_id']} password=\"{PASSWORD_PLAIN}\"")


if __name__ == "__main__":
    asyncio.run(main())
