"""
Residual truncation / authorization gaps found while verifying the L5L history fix.
These tests DOCUMENT defects that are still present after the fix.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
CUSTOMER_ID = "TSTG"
TAG = "TEST_GAP"
N_NOISE_SHIPMENTS = 3000
START = datetime(2023, 5, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def db():
    c = MongoClient(backend_env["MONGO_URL"])
    yield c[backend_env["DB_NAME"]]
    c.close()


@pytest.fixture(scope="module")
def session():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text[:300]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    s.tenant_id = r.json()["tenant_id"]
    return s


def _clean(db):
    db.users.delete_many({"customer_id": CUSTOMER_ID})
    db.invoices.delete_many({"customer_id": CUSTOMER_ID})
    db.shipments.delete_many({"customer_id": CUSTOMER_ID})
    db.shipments.delete_many({"id": {"$regex": f"^{TAG}_NOISE"}})


@pytest.fixture(scope="module")
def seed(db, session):
    tid = session.tenant_id
    _clean(db)
    sample = db.users.find_one({"role": "client", "tenant_id": tid, "customer_id": "A2824"})
    user_id = f"{TAG}_USER"
    db.users.insert_one({
        "id": user_id, "tenant_id": tid, "customer_id": CUSTOMER_ID, "name": f"{TAG} client",
        "email": f"{TAG.lower()}@example.test", "role": "client",
        "password_hash": sample["password_hash"], "created_at": START.isoformat(),
    })
    # one invoice for this client, ALREADY shipped
    db.invoices.insert_one({
        "id": f"{TAG}_INV", "tenant_id": tid, "user_id": user_id, "customer_id": CUSTOMER_ID,
        "invoice_number": f"{TAG}-0001", "purchase_ids": [], "subtotal": 10.0, "total_tax": 0.0,
        "total_commission": 0.0, "total": 10.0, "shipping_cost": 0.0, "saldo_pendiente": 0.0,
        "status": "approved", "is_annulled": False, "created_at": START.isoformat(),
    })
    # tenant-wide noise: >1000 shipments that carry an invoice_id
    db.shipments.insert_many([{
        "id": f"{TAG}_NOISE_{i:05d}", "tenant_id": tid, "user_id": f"{TAG}_OTHER",
        "customer_id": "ZZZZ", "purchase_ids": [], "invoice_id": f"{TAG}_NOISE_INV_{i:05d}",
        "shipping_cost": 0.0, "status": "pending",
        "created_at": (START + timedelta(minutes=i)).isoformat(),
    } for i in range(N_NOISE_SHIPMENTS)])
    # this client's shipment is inserted LAST -> falls outside the to_list(1000) window
    db.shipments.insert_one({
        "id": f"{TAG}_SHIP", "tenant_id": tid, "user_id": user_id, "customer_id": CUSTOMER_ID,
        "purchase_ids": [], "invoice_id": f"{TAG}_INV", "shipping_cost": 0.0, "status": "pending",
        "created_at": (START + timedelta(days=1)).isoformat(),
    })
    yield user_id
    _clean(db)


def test_for_shipment_shipped_invoice_must_not_reappear(session, seed):
    """GET /invoices/client/{cid}/for-shipment loads the tenant-wide shipment map with
    to_list(1000); with >1000 shipments the map is incomplete and an already-shipped
    invoice is offered again for shipment."""
    r = session.get(f"{API}/invoices/client/{CUSTOMER_ID}/for-shipment", timeout=60)
    assert r.status_code == 200, r.text[:300]
    ids = [i["id"] for i in r.json()]
    assert f"{TAG}_INV" not in ids, (
        "BUG: invoice that already has a shipment is returned as available for shipment "
        "(server.py line ~5811 shipments to_list(1000) is tenant-wide and truncates)"
    )


def test_wallet_transactions_idor(seed):
    """A client token must not be able to read another user's wallet transactions."""
    login = requests.post(f"{API}/auth/login", json={"identifier": CUSTOMER_ID, "password": "123"}, timeout=30)
    assert login.status_code == 200, login.text[:300]
    h = {"Authorization": f"Bearer {login.json()['token']}"}
    victim = requests.post(f"{API}/auth/login", json={"identifier": "A2824", "password": "123"}, timeout=30)
    assert victim.status_code == 200
    victim_id = victim.json()["user_id"]
    r = requests.get(f"{API}/wallet/transactions/{victim_id}", headers=h, timeout=30)
    assert r.status_code == 403, (
        f"BUG (IDOR): client read another user's wallet transactions -> {r.status_code}, "
        f"{len(r.json()) if r.status_code == 200 else ''} rows"
    )


def test_shipments_user_idor(seed):
    login = requests.post(f"{API}/auth/login", json={"identifier": CUSTOMER_ID, "password": "123"}, timeout=30)
    h = {"Authorization": f"Bearer {login.json()['token']}"}
    victim = requests.post(f"{API}/auth/login", json={"identifier": "A2824", "password": "123"}, timeout=30)
    victim_id = victim.json()["user_id"]
    r = requests.get(f"{API}/shipments/user/{victim_id}", headers=h, timeout=30)
    assert r.status_code == 403, f"BUG (IDOR): client read another user's shipments -> {r.status_code}"
