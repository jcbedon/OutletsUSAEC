"""
Iteration 21 — validation of the ATOMIC invoice_number counter
(server.py ~5990: db.counters find_one_and_update $inc + upsert).

Covers:
  * Sequential correctness for a brand new customer -> -001, -002, -003
  * Legacy alignment: customer with 5 pre-existing invoices (no counter doc)
    -> next invoice must be -006
  * Concurrency: 4 concurrent POSTs with DISJOINT purchase_ids, same customer
    -> 4x 200, numbers unique AND contiguous (no gaps, no duplicates)
  * Counter document shape / tenant scoping
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
    r = admin.post(f"{API}/lives", json={"title": "TEST_LIVE_COUNTER", "store": "TEST_STORE"}, timeout=60)
    assert r.status_code in (200, 201), r.text[:300]
    return r.json()["live_id"]


@pytest.fixture(scope="module")
def created(mongo):
    """Track created customers for teardown."""
    bag = []
    yield bag
    for cid, uid in bag:
        mongo.purchases.delete_many({"customer_id": cid})
        mongo.invoices.delete_many({"customer_id": cid})
        mongo.counters.delete_many({"customer_id": cid})
        mongo.wallet_transactions.delete_many({"customer_id": cid})
        mongo.wallets.delete_many({"customer_id": cid})
        mongo.shipments.delete_many({"customer_id": cid})
        mongo.users.delete_many({"id": uid})
    mongo.lives.delete_many({"title": "TEST_LIVE_COUNTER"})


def _new_client(admin, created):
    suffix = uuid.uuid4().hex[:6].upper()
    r = admin.post(f"{API}/admin/clients/create", json={
        "name": f"TESTCOUNTER {suffix}", "country": "Ecuador",
        "whatsapp": f"+5937{uuid.uuid4().int % 10**8:08d}",
        "email": f"testcounter_{suffix.lower()}@example.test",
        "password": "123456", "commission_fee": 2.0, "initial_balance": 0.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    body = r.json()
    created.append((body["customer_id"], body["user_id"]))
    return body["customer_id"]


def _mk_purchase(admin, cid, live_id, name, price=15.0):
    r = admin.post(f"{API}/purchases", json={
        "customer_id": cid, "item_name": name, "store": "TEST_STORE",
        "price": price, "live_id": live_id, "tax_rate": 0.0825,
        "apply_tax": True, "apply_commission": True, "commission_amount": 2.0,
    }, timeout=90)
    assert r.status_code in (200, 201), r.text[:300]
    return r.json()["purchase_id"]


def _invoice(admin, cid, pids, expect_ok=True):
    r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": pids}, timeout=120)
    if expect_ok:
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:300]}"
    return r


class TestSequentialNumbering:

    def test_three_serial_invoices_are_001_002_003(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        numbers = []
        for i in range(3):
            pid = _mk_purchase(admin, cid, live_id, f"TEST_CNT_SEQ_{i}", 10.0 + i)
            r = _invoice(admin, cid, [pid])
            inv_id = r.json()["invoice_id"]
            doc = mongo.invoices.find_one({"id": inv_id}, {"_id": 0, "invoice_number": 1})
            numbers.append(doc["invoice_number"])
        print("serial numbers:", numbers)
        assert numbers == [f"{cid}-001", f"{cid}-002", f"{cid}-003"], numbers

        counter = mongo.counters.find_one({"scope": "invoice_number", "customer_id": cid}, {"_id": 0})
        print("counter doc:", counter)
        assert counter is not None, "counter document was not created"
        assert counter["seq"] == 3, counter
        assert counter.get("tenant_id"), "counter is not tenant scoped"

    def test_api_response_exposes_invoice_number(self, admin, live_id, created):
        cid = _new_client(admin, created)
        pid = _mk_purchase(admin, cid, live_id, "TEST_CNT_RESP", 20.0)
        r = _invoice(admin, cid, [pid])
        body = r.json()
        print("create invoice body keys:", list(body.keys()))
        assert body.get("invoice_number") == f"{cid}-001", body


class TestLegacyAlignment:

    def test_customer_with_5_legacy_invoices_gets_006(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        tenant_id = None
        # find the tenant of this client through an existing invoice-less path:
        user = mongo.users.find_one({"customer_id": cid}, {"_id": 0, "tenant_id": 1, "id": 1})
        assert user, f"client {cid} not found in users"
        tenant_id = user["tenant_id"]

        # Inject 5 legacy invoices directly (simulating pre-counter history)
        for i in range(1, 6):
            mongo.invoices.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id, "user_id": user["id"],
                "customer_id": cid, "invoice_number": f"{cid}-{i:03d}",
                "purchase_ids": [], "subtotal": 0.0, "total_tax": 0.0,
                "total_commission": 0.0, "total": 0.0,
                "created_at": f"2025-01-0{i}T00:00:00", "is_annulled": False,
            })
        assert mongo.counters.find_one({"scope": "invoice_number", "customer_id": cid}) is None

        pid = _mk_purchase(admin, cid, live_id, "TEST_CNT_LEGACY", 33.0)
        r = _invoice(admin, cid, [pid])
        inv = mongo.invoices.find_one({"id": r.json()["invoice_id"]}, {"_id": 0, "invoice_number": 1})
        print("legacy-aligned number:", inv["invoice_number"])
        assert inv["invoice_number"] == f"{cid}-006", inv

        counter = mongo.counters.find_one({"scope": "invoice_number", "customer_id": cid}, {"_id": 0})
        assert counter["seq"] == 6, counter

        # next one continues from 007 (no re-alignment)
        pid2 = _mk_purchase(admin, cid, live_id, "TEST_CNT_LEGACY2", 34.0)
        r2 = _invoice(admin, cid, [pid2])
        inv2 = mongo.invoices.find_one({"id": r2.json()["invoice_id"]}, {"_id": 0, "invoice_number": 1})
        assert inv2["invoice_number"] == f"{cid}-007", inv2

        all_nums = sorted(d["invoice_number"] for d in
                          mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1}))
        assert len(all_nums) == len(set(all_nums)), all_nums


    def test_legacy_alignment_under_concurrency(self, admin, live_id, created, mongo):
        """Iteration 22 retest: 5 legacy invoices, NO counter doc, 5 CONCURRENT
        POSTs with disjoint purchase_ids -> CID-006..CID-010, no dup / no gap."""
        cid = _new_client(admin, created)
        user = mongo.users.find_one({"customer_id": cid}, {"_id": 0, "tenant_id": 1, "id": 1})
        tid = user["tenant_id"]
        for i in range(1, 6):
            mongo.invoices.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "user_id": user["id"],
                "customer_id": cid, "invoice_number": f"{cid}-{i:03d}",
                "purchase_ids": [], "subtotal": 0.0, "total_tax": 0.0,
                "total_commission": 0.0, "total": 0.0,
                "created_at": f"2025-03-0{i}T00:00:00", "is_annulled": False,
            })
        mongo.counters.delete_many({"customer_id": cid})
        assert mongo.counters.find_one({"scope": "invoice_number", "customer_id": cid}) is None

        sets = [[_mk_purchase(admin, cid, live_id, f"TEST_CNT_LEGCONC_{i}", 11.0 + i)] for i in range(5)]

        def submit(pids):
            return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                                 json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

        with ThreadPoolExecutor(max_workers=5) as ex:
            results = list(ex.map(submit, sets))
        codes = [r.status_code for r in results]
        print("legacy-concurrent codes:", codes)
        assert all(c in (200, 201) for c in codes), f"{codes} :: {[r.text[:150] for r in results]}"

        new_numbers = sorted(r.json()["invoice_number"] for r in results)
        print("legacy-concurrent new numbers:", new_numbers)
        assert new_numbers == [f"{cid}-{i:03d}" for i in range(6, 11)], new_numbers

        all_nums = sorted(d["invoice_number"] for d in
                          mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1}))
        assert len(all_nums) == 10, all_nums
        assert len(set(all_nums)) == 10, f"DUPLICATE invoice_number: {all_nums}"
        assert mongo.counters.count_documents({"scope": "invoice_number", "customer_id": cid}) == 1, \
            "more than one counter document created (missing unique index)"


class TestConcurrentNumbering:

    def test_four_concurrent_disjoint_invoices_are_contiguous(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        sets = [[_mk_purchase(admin, cid, live_id, f"TEST_CNT_CONC_{i}", 12.0 + i)] for i in range(4)]

        def submit(pids):
            return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                                 json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

        with ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(submit, sets))
        codes = [r.status_code for r in results]
        print("concurrent codes:", codes)
        assert all(c in (200, 201) for c in codes), f"{codes} :: {[r.text[:150] for r in results]}"

        numbers = sorted(d["invoice_number"] for d in
                         mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1}))
        print("concurrent numbers:", numbers)
        assert len(numbers) == 4, numbers
        assert len(set(numbers)) == 4, f"DUPLICATE invoice_number: {numbers}"
        assert numbers == [f"{cid}-{i:03d}" for i in range(1, 5)], f"gap/non-contiguous: {numbers}"

        integ = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
        assert integ["is_healthy"] is True, integ

    def test_eight_concurrent_disjoint_invoices_unique(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        sets = [[_mk_purchase(admin, cid, live_id, f"TEST_CNT_C8_{i}", 5.0 + i)] for i in range(8)]

        def submit(pids):
            return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                                 json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

        with ThreadPoolExecutor(max_workers=8) as ex:
            results = list(ex.map(submit, sets))
        codes = [r.status_code for r in results]
        print("8-way concurrent codes:", codes)
        assert all(c in (200, 201) for c in codes), codes

        numbers = sorted(d["invoice_number"] for d in
                         mongo.invoices.find({"customer_id": cid}, {"_id": 0, "invoice_number": 1}))
        print("8-way numbers:", numbers)
        assert numbers == [f"{cid}-{i:03d}" for i in range(1, 9)], numbers


class TestGuardRegressions:

    def test_same_purchase_ids_concurrent_only_one_wins(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        pids = [_mk_purchase(admin, cid, live_id, "TEST_CNT_RACE_A", 21.0),
                _mk_purchase(admin, cid, live_id, "TEST_CNT_RACE_B", 22.0)]

        def submit(_):
            return requests.post(f"{API}/invoices", headers=dict(admin.headers),
                                 json={"customer_id": cid, "purchase_ids": pids}, timeout=120)

        with ThreadPoolExecutor(max_workers=5) as ex:
            results = list(ex.map(submit, range(5)))
        codes = sorted(r.status_code for r in results)
        print("identical-ids concurrent codes:", codes)
        assert codes.count(200) + codes.count(201) == 1, codes
        assert codes.count(409) == 4, codes
        assert mongo.invoices.count_documents({"customer_id": cid}) == 1

        integ = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
        assert integ["is_healthy"] is True, integ

    def test_unknown_purchase_id_returns_400(self, admin, created):
        cid = _new_client(admin, created)
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [str(uuid.uuid4())]}, timeout=90)
        print("unknown pid ->", r.status_code, r.text[:150])
        assert r.status_code == 400, r.text[:300]

    def test_already_invoiced_returns_409(self, admin, live_id, created):
        cid = _new_client(admin, created)
        pid = _mk_purchase(admin, cid, live_id, "TEST_CNT_ALREADY", 41.0)
        _invoice(admin, cid, [pid])
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=90)
        print("already invoiced ->", r.status_code, r.text[:150])
        assert r.status_code == 409, r.text[:300]

    def test_soft_deleted_returns_409(self, admin, live_id, created, mongo):
        cid = _new_client(admin, created)
        pid = _mk_purchase(admin, cid, live_id, "TEST_CNT_SOFTDEL", 42.0)
        mongo.purchases.update_one({"id": pid}, {"$set": {"is_deleted": True}})
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=90)
        print("soft deleted ->", r.status_code, r.text[:150])
        assert r.status_code == 409, r.text[:300]
        assert mongo.invoices.count_documents({"customer_id": cid}) == 0

    def test_no_counter_leak_across_customers(self, admin, live_id, created, mongo):
        """Two different customers must have independent sequences."""
        c1 = _new_client(admin, created)
        c2 = _new_client(admin, created)
        for cid in (c1, c2):
            pid = _mk_purchase(admin, cid, live_id, f"TEST_CNT_ISO_{cid}", 9.0)
            r = _invoice(admin, cid, [pid])
            inv = mongo.invoices.find_one({"id": r.json()["invoice_id"]}, {"_id": 0, "invoice_number": 1})
            assert inv["invoice_number"] == f"{cid}-001", inv
