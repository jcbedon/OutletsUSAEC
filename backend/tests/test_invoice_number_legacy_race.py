"""
Iteration 21 — edge case of the new atomic invoice_number counter:
legacy alignment happens AFTER the $inc, so the first burst of concurrent
invoices for a customer that has pre-counter history can still collide with
existing legacy numbers.
"""
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
_be = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _be.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _be.get("DB_NAME")


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m_id = re.search(r"(?im)^-\s*identifier:\s*(\S+)", content)
    m_pw = re.search(r"(?im)^-\s*password:\s*(\S+)", content)
    if not m_id or not m_pw:
        pytest.skip("No admin credentials in /app/memory/test_credentials.md")
    return m_id.group(1), m_pw.group(1)


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def admin():
    identifier, password = _creds()
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=90)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def live_id(admin):
    r = admin.post(f"{API}/lives", json={"title": "TEST_LIVE_LEGACYRACE", "store": "TEST_STORE"}, timeout=60)
    assert r.status_code in (200, 201), r.text[:300]
    return r.json()["live_id"]


@pytest.fixture(scope="module")
def client_ctx(admin, mongo):
    suffix = uuid.uuid4().hex[:6].upper()
    r = admin.post(f"{API}/admin/clients/create", json={
        "name": f"TESTLEGRACE {suffix}", "country": "Ecuador",
        "whatsapp": f"+5937{uuid.uuid4().int % 10**8:08d}",
        "email": f"testlegrace_{suffix.lower()}@example.test",
        "password": "123456", "commission_fee": 2.0, "initial_balance": 0.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    body = r.json()
    cid = body["customer_id"]
    yield {"customer_id": cid, "user_id": body["user_id"]}
    mongo.purchases.delete_many({"customer_id": cid})
    mongo.invoices.delete_many({"customer_id": cid})
    mongo.counters.delete_many({"customer_id": cid})
    mongo.wallet_transactions.delete_many({"customer_id": cid})
    mongo.wallets.delete_many({"customer_id": cid})
    mongo.shipments.delete_many({"customer_id": cid})
    mongo.users.delete_many({"id": body["user_id"]})
    mongo.lives.delete_many({"title": "TEST_LIVE_LEGACYRACE"})


def test_legacy_customer_concurrent_first_burst_no_duplicates(admin, live_id, client_ctx, mongo):
    cid = client_ctx["customer_id"]
    user = mongo.users.find_one({"customer_id": cid}, {"_id": 0, "tenant_id": 1, "id": 1})
    tid = user["tenant_id"]

    # 5 legacy invoices, no counter document (pre-fix history)
    for i in range(1, 6):
        mongo.invoices.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tid, "user_id": user["id"],
            "customer_id": cid, "invoice_number": f"{cid}-{i:03d}",
            "purchase_ids": [], "subtotal": 0.0, "total_tax": 0.0,
            "total_commission": 0.0, "total": 0.0,
            "created_at": f"2025-02-0{i}T00:00:00", "is_annulled": False,
        })
    mongo.counters.delete_many({"customer_id": cid})

    sets = []
    for i in range(4):
        r = admin.post(f"{API}/purchases", json={
            "customer_id": cid, "item_name": f"TEST_LEGRACE_{i}", "store": "TEST_STORE",
            "price": 10.0 + i, "live_id": live_id, "tax_rate": 0.0825,
            "apply_tax": True, "apply_commission": True, "commission_amount": 2.0,
        }, timeout=90)
        assert r.status_code in (200, 201), r.text[:300]
        sets.append([r.json()["purchase_id"]])

    def submit(pids):
        return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                             json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(submit, sets))
    codes = [r.status_code for r in results]
    print("legacy-burst codes:", codes)
    assert all(c in (200, 201) for c in codes), codes

    numbers = sorted(d["invoice_number"] for d in
                     mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1}))
    print("legacy-burst all numbers:", numbers)
    assert len(numbers) == len(set(numbers)), f"DUPLICATE invoice_number vs legacy history: {numbers}"
