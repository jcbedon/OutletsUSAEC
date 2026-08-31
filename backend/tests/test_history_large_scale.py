"""
Large-scale (slow) test: cascade + list endpoints with 1200 invoices.
Proves recalculate_client_invoices() no longer truncates at 1000 and that
GET /api/invoices/client/{customer_id} stays under the perf budget.
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
CUSTOMER_ID = "TSTB"
TAG = "TEST_BIG"
N = 1200
INVOICE_TOTAL = 10.0
START = datetime(2022, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


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


@pytest.fixture(scope="module")
def seed(db, session):
    tid = session.tenant_id
    db.users.delete_many({"customer_id": CUSTOMER_ID})
    db.invoices.delete_many({"customer_id": CUSTOMER_ID})
    sample = db.users.find_one({"role": "client", "tenant_id": tid, "customer_id": "A2824"})
    user_id = f"{TAG}_USER"
    db.users.insert_one({
        "id": user_id, "tenant_id": tid, "customer_id": CUSTOMER_ID,
        "name": f"{TAG} client", "email": f"{TAG.lower()}@example.test",
        "role": "client", "password_hash": sample["password_hash"],
        "created_at": START.isoformat(),
    })
    db.invoices.insert_many([{
        "id": f"{TAG}_INV_{i:05d}", "tenant_id": tid, "user_id": user_id,
        "customer_id": CUSTOMER_ID, "invoice_number": f"{TAG}-{i:05d}",
        "purchase_ids": [], "subtotal": INVOICE_TOTAL, "total_tax": 0.0,
        "total_commission": 0.0, "total": INVOICE_TOTAL, "shipping_cost": 0.0,
        "saldo_pendiente": 0.0, "status": "approved", "is_annulled": False,
        "created_at": (START + timedelta(days=i)).isoformat(),
    } for i in range(N)])
    yield user_id
    db.users.delete_many({"customer_id": CUSTOMER_ID})
    db.invoices.delete_many({"customer_id": CUSTOMER_ID})


def test_list_all_1200_invoices_fast(session, seed):
    t0 = time.time()
    r = session.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=60)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert len(data) == N, f"expected {N}, got {len(data)}"
    assert data[-1]["invoice_number"] == f"{TAG}-00000"
    assert elapsed < 3.0, f"took {elapsed:.2f}s"


def test_recalc_cascade_covers_all_1200(session, seed, db):
    r = session.post(f"{API}/admin/recalculate-invoices/{CUSTOMER_ID}", timeout=600)
    assert r.status_code == 200, r.text[:300]
    docs = list(db.invoices.find(
        {"customer_id": CUSTOMER_ID},
        {"_id": 0, "id": 1, "total_a_pagar": 1, "saldo_pendiente": 1},
    ).sort("created_at", 1))
    assert len(docs) == N
    missing = [d["id"] for d in docs if d.get("total_a_pagar") is None]
    assert not missing, f"{len(missing)} invoices not recalculated (truncation at 1000?): {missing[:3]}"
    # last invoice must carry the full accumulated debt of all 1200 invoices
    assert docs[-1]["total_a_pagar"] == pytest.approx(N * INVOICE_TOTAL)
    assert docs[1000]["saldo_pendiente"] == pytest.approx(1000 * INVOICE_TOTAL)
