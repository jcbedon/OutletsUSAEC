"""
Iteration 20 — validation of the ATOMIC purchase claim in POST /api/invoices.

Covers:
  * Deterministic rollback path: pre-check passes but the conditional
    update_many cannot claim every purchase -> 409 + inserted invoice deleted
    + partially-claimed purchases released.
  * invoice_number uniqueness under concurrent creation of DIFFERENT invoices
    for the same customer (count_documents + 1 is itself a race).
  * Regression: annul -> restore guards (409 when purchases were re-billed).
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
def ctx(admin, mongo):
    live = admin.post(f"{API}/lives", json={"title": "TEST_LIVE_ATOMIC", "store": "TEST_STORE"},
                      timeout=60).json()["live_id"]
    suffix = uuid.uuid4().hex[:6].upper()
    r = admin.post(f"{API}/admin/clients/create", json={
        "name": f"TESTATOMIC {suffix}", "country": "Ecuador",
        "whatsapp": f"+5937{uuid.uuid4().int % 10**8:08d}",
        "email": f"testatomic_{suffix.lower()}@example.test",
        "password": "123456", "commission_fee": 2.0, "initial_balance": 0.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    body = r.json()
    cid = body["customer_id"]
    yield {"live_id": live, "customer_id": cid, "user_id": body["user_id"]}
    mongo.purchases.delete_many({"customer_id": cid})
    mongo.invoices.delete_many({"customer_id": cid})
    mongo.wallet_transactions.delete_many({"customer_id": cid})
    mongo.wallets.delete_many({"customer_id": cid})
    mongo.shipments.delete_many({"customer_id": cid})
    mongo.users.delete_many({"id": body["user_id"]})
    mongo.lives.delete_many({"title": "TEST_LIVE_ATOMIC"})


def _mk_purchase(admin, cid, live_id, name, price=25.0):
    r = admin.post(f"{API}/purchases", json={
        "customer_id": cid, "item_name": name, "store": "TEST_STORE",
        "price": price, "live_id": live_id, "tax_rate": 0.0825,
        "apply_tax": True, "apply_commission": True, "commission_amount": 2.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    return r.json()["purchase_id"]


class TestAtomicClaimRollback:

    def test_claim_mismatch_rolls_back_invoice_and_releases_purchases(self, admin, ctx, mongo):
        """invoice_id set to a falsy-but-unmatched value (0) passes the python
        pre-check (`p.get('invoice_id')` is falsy) yet cannot be claimed by the
        conditional update filter -> exercises the rollback branch."""
        cid = ctx["customer_id"]
        p_ok = _mk_purchase(admin, cid, ctx["live_id"], "TEST_ATOMIC_OK", 30.0)
        p_bad = _mk_purchase(admin, cid, ctx["live_id"], "TEST_ATOMIC_BAD", 40.0)
        mongo.purchases.update_one({"id": p_bad}, {"$set": {"invoice_id": 0}})

        before = mongo.invoices.count_documents({"customer_id": cid})
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [p_ok, p_bad]}, timeout=120)
        print("claim-mismatch ->", r.status_code, r.text[:200])
        assert r.status_code == 409, f"expected 409 rollback, got {r.status_code}: {r.text[:300]}"
        assert "mismo tiempo" in r.json().get("detail", ""), r.json()

        # invoice document must NOT survive
        assert mongo.invoices.count_documents({"customer_id": cid}) == before, "rolled-back invoice still in DB"
        # claimed purchase must be released
        assert mongo.purchases.find_one({"id": p_ok}, {"_id": 0, "invoice_id": 1}).get("invoice_id") in (None, ""), \
            "partially claimed purchase was not released"

        integ = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
        assert integ["is_healthy"] is True, integ

        mongo.purchases.update_one({"id": p_bad}, {"$set": {"invoice_id": None}})

    def test_happy_path_after_rollback(self, admin, ctx, mongo):
        """The purchases released by the rollback are still invoiceable."""
        cid = ctx["customer_id"]
        pending = [p["id"] for p in mongo.purchases.find(
            {"customer_id": cid, "$or": [{"invoice_id": None}, {"invoice_id": {"$exists": False}}]},
            {"_id": 0, "id": 1})]
        assert len(pending) >= 2, pending
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": pending}, timeout=120)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:300]}"
        inv_id = r.json()["invoice_id"]
        for pid in pending:
            assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] == inv_id
        integ = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
        assert integ["is_healthy"] is True, integ


class TestConcurrentDistinctInvoices:

    def test_invoice_numbers_unique_under_concurrency(self, admin, ctx, mongo):
        """4 concurrent invoices for the SAME customer but DISJOINT purchases."""
        cid = ctx["customer_id"]
        sets = []
        for i in range(4):
            sets.append([_mk_purchase(admin, cid, ctx["live_id"], f"TEST_SEQ_{i}", 10.0 + i)])

        def submit(pids):
            return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                                 json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

        with ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(submit, sets))
        codes = [r.status_code for r in results]
        print("disjoint concurrent codes:", codes)
        assert all(c in (200, 201) for c in codes), f"disjoint invoices should all succeed: {codes}"

        numbers = [d["invoice_number"] for d in mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1})]
        print("invoice numbers:", sorted(numbers))
        assert len(numbers) == len(set(numbers)), f"duplicate invoice_number generated under concurrency: {sorted(numbers)}"

        integ = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
        assert integ["is_healthy"] is True, integ


class TestAnnulRestoreRegression:

    def test_restore_blocked_when_purchases_rebilled(self, admin, ctx, mongo):
        cid = ctx["customer_id"]
        _, password = _creds()
        pid = _mk_purchase(admin, cid, ctx["live_id"], "TEST_ANNUL_RESTORE", 55.0)
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=120)
        assert r.status_code in (200, 201), r.text[:300]
        inv_id = r.json()["invoice_id"]

        ra = admin.put(f"{API}/invoices/{inv_id}/annul", json={"password": password}, timeout=120)
        assert ra.status_code == 200, ra.text[:300]
        assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] is None

        # re-bill the freed purchase
        r2 = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=120)
        assert r2.status_code in (200, 201), r2.text[:300]

        # restore must now be blocked with 409
        rr = admin.put(f"{API}/invoices/{inv_id}/restore", json={"password": password}, timeout=120)
        assert rr.status_code == 409, f"expected 409, got {rr.status_code}: {rr.text[:300]}"
        assert "re-facturados" in rr.json().get("detail", ""), rr.json()

    def test_restore_requires_password(self, admin, ctx, mongo):
        cid = ctx["customer_id"]
        inv = mongo.invoices.find_one({"customer_id": cid}, {"_id": 0, "id": 1})
        r = admin.put(f"{API}/invoices/{inv['id']}/restore", json={}, timeout=90)
        assert r.status_code == 400, f"{r.status_code}: {r.text[:200]}"
