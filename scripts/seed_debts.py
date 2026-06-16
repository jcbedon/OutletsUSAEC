"""Seed realistic debts on top of the previously seeded clients.

Picks 20 random clients and forces them into a "with debt" state by inserting
old approved invoices with `total_a_pagar > 0`. Different age buckets so the
debts panel & inactive-clients panel have varied stress test data.
"""
import os
import sys
import random
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

import asyncio  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TENANT_ID = "44f368aa-96cc-46b0-b5ca-319a125c992e"
N_DEBTORS = 20


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    clients = await db.users.find(
        {"tenant_id": TENANT_ID, "role": "client"},
        {"_id": 0, "id": 1, "customer_id": 1, "name": 1, "email": 1}
    ).to_list(2000)
    if not clients:
        print("No hay clientes en el tenant. Corre primero seed_test_data.py")
        return

    # Pick deterministic random subset to make the seed reproducible.
    random.seed(99)
    picked = random.sample(clients, min(N_DEBTORS, len(clients)))
    now = datetime.now(timezone.utc)

    # Distribution: spread across 7d, 30d, 60d, 90d buckets so the "Inactivos"
    # tab + "Deudas" table both have varied data to filter on.
    age_buckets = [7, 14, 30, 45, 60, 75, 90, 120]
    invoices = []
    # Sequential number — start high to avoid collisions with existing seeded ones.
    base_seq = 9000
    new_invoices_count = 0
    for idx, c in enumerate(picked):
        days_ago = age_buckets[idx % len(age_buckets)]
        created_at = (now - timedelta(days=days_ago, hours=random.randint(0, 23)))
        # Random amount between $40 and $250 — mix of small and large debts.
        amount = round(random.uniform(40, 250), 2)
        # Break it down into subtotal + tax + commission so it looks real.
        commission = random.choice([3.0, 4.0])
        # subtotal + 8.25% tax + commission = amount → solve for subtotal
        subtotal = round((amount - commission) / 1.0825, 2)
        total_tax = round(subtotal * 0.0825, 2)
        total = round(subtotal + total_tax + commission, 2)

        invoices.append({
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "user_id": c["id"],
            "customer_id": c["customer_id"],
            "invoice_number": f"DBT-{base_seq + idx}",
            "purchase_ids": [],
            "subtotal": subtotal,
            "total_tax": total_tax,
            "total_commission": commission,
            "total": total,
            "saldo_pendiente": 0,
            "saldo_a_favor_anterior": 0,
            "saldo_a_favor": 0,
            # `total_a_pagar` > 0 is what the Stats panel reads as "current debt".
            "total_a_pagar": total,
            "applied_deposits": 0,
            "status": "approved",
            "is_annulled": False,
            "created_at": created_at.isoformat(),
            "approved_at": (created_at + timedelta(hours=1)).isoformat(),
            "notes": f"Seed: deuda de prueba ({days_ago}d sin pagar)",
        })
        new_invoices_count += 1

    if invoices:
        await db.invoices.insert_many(invoices)

    print(f"✓ {new_invoices_count} facturas-deuda creadas para {len(picked)} clientes")
    print()
    print("Distribución por antigüedad:")
    for d in sorted(set(age_buckets)):
        n = sum(1 for i, _ in enumerate(picked) if age_buckets[i % len(age_buckets)] == d)
        if n:
            print(f"  {d}d sin pagar: {n} clientes")

    total_debt = round(sum(i["total"] for i in invoices), 2)
    print()
    print(f"Deuda total agregada: ${total_debt:,.2f}")
    print(f"Promedio por cliente: ${total_debt/len(picked):,.2f}")
    print()
    print("Ejemplos:")
    for inv in invoices[:5]:
        c = next(x for x in picked if x["id"] == inv["user_id"])
        days = int((now - datetime.fromisoformat(inv["created_at"].replace("Z", "+00:00"))).days)
        print(f"  {c['customer_id']:8s} {c['name'][:25]:25s} debe ${inv['total']:7.2f} ({days}d sin pagar)")


if __name__ == "__main__":
    asyncio.run(main())
