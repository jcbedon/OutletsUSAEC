"""Concurrency probe for the create_invoice guard (TOCTOU window).

The guard added in iteration 19 is a read-then-write check; the subsequent
purchases.update_many is NOT conditional on invoice_id being null. This test
fires N identical POST /api/invoices requests in parallel to see whether two
invoices can still claim the same purchases.
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


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def token():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    ident = re.search(r"(?im)^-\s*identifier:\s*(\S+)", content).group(1)
    pwd = re.search(r"(?im)^-\s*password:\s*(\S+)", content).group(1)
    r = requests.post(f"{API}/auth/login", json={"identifier": ident, "password": pwd}, timeout=90)
    assert r.status_code == 200, r.text[:300]
    return r.json()["token"]


@pytest.fixture(scope="module")
def ctx(token, mongo):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    live = requests.post(f"{API}/lives", json={"title": "TEST_LIVE_RACE", "store": "TEST_STORE"},
                         headers=h, timeout=60).json()["live_id"]
    suffix = uuid.uuid4().hex[:6].upper()
    r = requests.post(f"{API}/admin/clients/create", headers=h, json={
        "name": f"TESTRACE {suffix}", "country": "Ecuador",
        "whatsapp": f"+5938{uuid.uuid4().int % 10**8:08d}",
        "email": f"testrace_{suffix.lower()}@example.test",
        "password": "123456", "commission_fee": 2.0, "initial_balance": 0.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    body = r.json()
    yield {"headers": h, "live_id": live, "customer_id": body["customer_id"], "user_id": body["user_id"]}
    cid = body["customer_id"]
    mongo.purchases.delete_many({"customer_id": cid})
    mongo.invoices.delete_many({"customer_id": cid})
    mongo.wallet_transactions.delete_many({"customer_id": cid})
    mongo.wallets.delete_many({"customer_id": cid})
    mongo.users.delete_many({"id": body["user_id"]})
    mongo.lives.delete_many({"title": "TEST_LIVE_RACE"})


def test_parallel_identical_submits_produce_single_invoice(ctx, mongo):
    h, cid = ctx["headers"], ctx["customer_id"]
    pids = []
    for i in range(2):
        r = requests.post(f"{API}/purchases", headers=h, json={
            "customer_id": cid, "item_name": f"TEST_RACE_ITEM_{i}", "store": "TEST_STORE",
            "price": 30.0, "live_id": ctx["live_id"], "tax_rate": 0.0825,
            "apply_tax": True, "apply_commission": True, "commission_amount": 2.0}, timeout=90)
        assert r.status_code in (200, 201), r.text[:300]
        pids.append(r.json()["purchase_id"])

    payload = {"customer_id": cid, "purchase_ids": pids}

    def submit(_):
        return requests.post(f"{API}/invoices", headers=h, json=payload, timeout=120)

    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(submit, range(5)))

    codes = [r.status_code for r in results]
    created = [r for r in results if r.status_code in (200, 201)]
    print("parallel submit status codes:", codes)

    invoices = list(mongo.invoices.find({"customer_id": cid}, {"_id": 0, "id": 1, "purchase_ids": 1}))
    print("invoices created:", len(invoices))

    integ = requests.get(f"{API}/admin/clients/{cid}/purchase-integrity", headers=h, timeout=90).json()
    print("integrity after parallel submits:", {
        "is_healthy": integ["is_healthy"],
        "orphans": len(integ["orphans_in_invoice"]),
        "cross_invoice_conflicts": len(integ["cross_invoice_conflicts"]),
        "not_found": len(integ["purchase_ids_not_found"]),
    })

    # --- CRITICAL: never more than one winner, never any corruption ---
    assert len(created) <= 1, (
        f"TOCTOU: {len(created)} invoices accepted for the same purchase_ids "
        f"(codes={codes}, invoices_in_db={len(invoices)}) - guard is not atomic"
    )
    assert len(invoices) == len(created), (
        f"{len(invoices)} invoice docs in DB but {len(created)} successful responses "
        f"(codes={codes}) - rollback did not clean up"
    )
    assert integ["is_healthy"] is True, integ
    assert integ["cross_invoice_conflicts"] == [], integ["cross_invoice_conflicts"]
    assert integ["orphans_in_invoice"] == [], integ["orphans_in_invoice"]
    assert integ["purchase_ids_not_found"] == [], integ["purchase_ids_not_found"]

    if len(created) == 1:
        for pid in pids:
            assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] == invoices[0]["id"]
    else:
        # all losers rolled back -> purchases must be released, nothing orphaned
        for pid in pids:
            assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1}).get("invoice_id") in (None, "")

    # Desired contract from the fix: exactly one 200 and the rest 409
    assert len(created) == 1, (
        f"no invoice survived the concurrent burst (codes={codes}); all requests rolled back "
        "(livelock) - user would have to retry manually"
    )
    assert all(c == 409 for c in codes if c not in (200, 201)), f"unexpected status codes: {codes}"


def test_second_burst_after_success_is_all_409(ctx, mongo):
    """After a successful invoice, a fresh concurrent burst on the same ids must be all-409."""
    h, cid = ctx["headers"], ctx["customer_id"]
    pids = []
    for i in range(2):
        r = requests.post(f"{API}/purchases", headers=h, json={
            "customer_id": cid, "item_name": f"TEST_RACE2_ITEM_{i}", "store": "TEST_STORE",
            "price": 20.0, "live_id": ctx["live_id"], "tax_rate": 0.0825,
            "apply_tax": True, "apply_commission": True, "commission_amount": 2.0}, timeout=90)
        assert r.status_code in (200, 201), r.text[:300]
        pids.append(r.json()["purchase_id"])

    payload = {"customer_id": cid, "purchase_ids": pids}
    first = requests.post(f"{API}/invoices", headers=h, json=payload, timeout=120)
    assert first.status_code in (200, 201), first.text[:300]
    inv_id = first.json()["invoice_id"]
    before = mongo.invoices.count_documents({"customer_id": cid})

    def submit(_):
        return requests.post(f"{API}/invoices", headers=h, json=payload, timeout=120)

    with ThreadPoolExecutor(max_workers=4) as ex:
        codes = [r.status_code for r in ex.map(submit, range(4))]
    print("second burst codes:", codes)
    assert codes == [409] * 4, codes
    assert mongo.invoices.count_documents({"customer_id": cid}) == before
    for pid in pids:
        assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] == inv_id

    integ = requests.get(f"{API}/admin/clients/{cid}/purchase-integrity", headers=h, timeout=90).json()
    assert integ["is_healthy"] is True, integ
