"""
Regression tests for the production truncation bug (client L5L: April/May 2025 history missing).

Verifies that per-client history endpoints no longer truncate:
  - GET /api/invoices/client/{customer_id}            (was to_list(100))
  - GET /api/invoices/client/{customer_id}/for-shipment (was to_list(100))
  - GET /api/wallet/transactions/{user_id}            (was limit(50))
  - GET /api/invoices/client/{customer_id}/history    (was to_list(500))
  - GET /api/shipments/user/{user_id}                 (was to_list(100))
  - recalculate_client_invoices cascade over ALL invoices (was to_list(1000))
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = backend_env["MONGO_URL"]
DB_NAME = backend_env["DB_NAME"]

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
CUSTOMER_ID = "TSTL"          # test client with huge history
TEST_TAG = "TEST_TRUNC"       # marker for cleanup
N_INVOICES = 130              # > 100 (old limit)
N_ANNULLED = 5
N_LINKED_SHIPMENTS = 30       # oldest invoices already shipped
N_EXTRA_SHIPMENTS = 100
N_WALLET_TX = 70              # > 50 (old limit)
N_DELETED_WALLET_TX = 3
N_PAID_PURCHASES = 520        # > 500 (old limit)
N_UNPAID_PURCHASES = 10
INVOICE_TOTAL = 10.0
START = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tenant_id(admin_token):
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    return r.json()["tenant_id"]


def _cleanup(db):
    db.users.delete_many({"customer_id": CUSTOMER_ID})
    for coll in ("invoices", "shipments", "wallet_transactions", "purchases"):
        db[coll].delete_many({"customer_id": CUSTOMER_ID})


@pytest.fixture(scope="module")
def seed(mongo, tenant_id):
    """Insert a client with a very large history directly in Mongo."""
    db = mongo
    _cleanup(db)

    # reuse the password_hash of an existing seed client (password '123')
    sample = db.users.find_one({"role": "client", "tenant_id": tenant_id, "customer_id": "A2824"})
    if not sample:
        pytest.fail("No seed client found to copy password_hash from")

    user_id = f"{TEST_TAG}_USER"
    db.users.insert_one({
        "id": user_id,
        "tenant_id": tenant_id,
        "customer_id": CUSTOMER_ID,
        "name": f"{TEST_TAG} Large History",
        "email": f"{TEST_TAG.lower()}@example.test",
        "whatsapp": "0999999999",
        "role": "client",
        "password_hash": sample["password_hash"],
        "created_at": START.isoformat(),
    })

    invoices = []
    for i in range(N_INVOICES):
        created = (START + timedelta(days=4 * i)).isoformat()
        invoices.append({
            "id": f"{TEST_TAG}_INV_{i:04d}",
            "tenant_id": tenant_id,
            "user_id": user_id,
            "customer_id": CUSTOMER_ID,
            "invoice_number": f"{TEST_TAG}-{i:04d}",
            "purchase_ids": [],
            "subtotal": INVOICE_TOTAL,
            "total_tax": 0.0,
            "total_commission": 0.0,
            "total": INVOICE_TOTAL,
            "shipping_cost": 0.0,
            "saldo_pendiente": 0.0,
            "status": "approved",
            "is_annulled": False,
            "created_at": created,
        })
    for j in range(N_ANNULLED):
        created = (START + timedelta(days=4 * j + 1)).isoformat()
        invoices.append({
            "id": f"{TEST_TAG}_INVANN_{j:04d}",
            "tenant_id": tenant_id,
            "user_id": user_id,
            "customer_id": CUSTOMER_ID,
            "invoice_number": f"{TEST_TAG}-ANN-{j:04d}",
            "purchase_ids": [],
            "subtotal": 5.0, "total_tax": 0.0, "total_commission": 0.0, "total": 5.0,
            "shipping_cost": 0.0, "saldo_pendiente": 0.0,
            "status": "approved", "is_annulled": True, "created_at": created,
        })
    db.invoices.insert_many(invoices)

    shipments = []
    for i in range(N_LINKED_SHIPMENTS):  # linked to the OLDEST invoices
        shipments.append({
            "id": f"{TEST_TAG}_SHIPL_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID, "purchase_ids": [], "invoice_id": f"{TEST_TAG}_INV_{i:04d}",
            "shipping_cost": 0.0, "status": "pending",
            "created_at": (START + timedelta(days=4 * i, hours=2)).isoformat(),
        })
    for i in range(N_EXTRA_SHIPMENTS):
        shipments.append({
            "id": f"{TEST_TAG}_SHIPX_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID, "purchase_ids": [], "invoice_id": None,
            "shipping_cost": 0.0, "status": "pending",
            "created_at": (START + timedelta(days=3 * i, hours=5)).isoformat(),
        })
    db.shipments.insert_many(shipments)

    wtx = []
    for i in range(N_WALLET_TX):
        wtx.append({
            "id": f"{TEST_TAG}_WTX_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID,
            # kept 'pending' so recalculate_client_invoices math stays deterministic
            "type": "deposit", "amount": 20.0, "balance_after": 0.0,
            "description": f"{TEST_TAG} recarga {i}", "status": "pending",
            "created_at": (START + timedelta(days=5 * i)).isoformat(),
        })
    for i in range(N_DELETED_WALLET_TX):
        wtx.append({
            "id": f"{TEST_TAG}_WTXDEL_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID, "type": "deposit", "amount": 5.0, "balance_after": 0.0,
            "description": f"{TEST_TAG} borrada {i}", "status": "approved", "is_deleted": True,
            "created_at": (START + timedelta(days=i)).isoformat(),
        })
    db.wallet_transactions.insert_many(wtx)

    purchases = []
    for i in range(N_PAID_PURCHASES):
        d = (START + timedelta(hours=6 * i)).isoformat()
        purchases.append({
            "id": f"{TEST_TAG}_PUR_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID, "item_name": f"{TEST_TAG} item {i}", "store": "TestStore",
            "price": 1.0, "tax": 0.0, "price_with_tax": 1.0, "commission": 0.0, "total": 1.0,
            "status": "paid", "live_id": str(uuid.uuid4()), "created_at": d, "paid_at": d,
        })
    for i in range(N_UNPAID_PURCHASES):
        d = (START + timedelta(hours=6 * i, minutes=30)).isoformat()
        purchases.append({
            "id": f"{TEST_TAG}_PURC_{i:04d}", "tenant_id": tenant_id, "user_id": user_id,
            "customer_id": CUSTOMER_ID, "item_name": f"{TEST_TAG} conf {i}", "store": "TestStore",
            "price": 1.0, "tax": 0.0, "price_with_tax": 1.0, "commission": 0.0, "total": 1.0,
            "status": "confirmed", "live_id": str(uuid.uuid4()), "created_at": d,
        })
    db.purchases.insert_many(purchases)

    yield {"user_id": user_id, "tenant_id": tenant_id}
    _cleanup(db)


OLDEST_INVOICE_NUMBER = f"{TEST_TAG}-0000"


# ---------- invoices/client ----------

class TestClientInvoicesNoTruncation:
    def test_returns_all_non_annulled_invoices(self, admin_client, seed):
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == N_INVOICES, f"expected {N_INVOICES}, got {len(data)} (truncation?)"
        numbers = {d["invoice_number"] for d in data}
        assert OLDEST_INVOICE_NUMBER in numbers, "oldest invoice missing -> still truncated"
        assert not any(d.get("is_annulled") for d in data)
        # no mongo _id leaked
        assert all("_id" not in d for d in data)

    def test_sorted_desc_by_created_at(self, admin_client, seed):
        data = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=60).json()
        created = [d["created_at"] for d in data]
        assert created == sorted(created, reverse=True)

    def test_april_may_2025_present(self, admin_client, seed):
        """The exact production symptom: old months disappeared."""
        data = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=60).json()
        months = {d["created_at"][:7] for d in data}
        for m in ("2025-01", "2025-04", "2025-05", "2026-01"):
            assert m in months, f"missing invoices for {m}: {sorted(months)[:5]}"

    def test_include_annulled(self, admin_client, seed):
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}?include_annulled=true", timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == N_INVOICES + N_ANNULLED
        assert sum(1 for d in data if d.get("is_annulled")) == N_ANNULLED

    def test_case_insensitive_customer_id(self, admin_client, seed):
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID.lower()}", timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == N_INVOICES

    def test_performance_under_3s(self, admin_client, seed):
        t0 = time.time()
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=60)
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert elapsed < 3.0, f"took {elapsed:.2f}s for {N_INVOICES} invoices"

    def test_client_role_sees_own_full_history(self, seed):
        login = requests.post(f"{API}/auth/login", json={"identifier": CUSTOMER_ID, "password": "123"}, timeout=30)
        assert login.status_code == 200, login.text[:300]
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/invoices/client/{CUSTOMER_ID}", headers=h, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == N_INVOICES
        # cannot read another client's invoices
        other = requests.get(f"{API}/invoices/client/A2824", headers=h, timeout=30)
        assert other.status_code == 403

    def test_requires_auth(self, seed):
        r = requests.get(f"{API}/invoices/client/{CUSTOMER_ID}", timeout=30)
        assert r.status_code in (401, 403, 422)


# ---------- for-shipment ----------

class TestForShipmentNoTruncation:
    def test_returns_all_invoices_without_shipment(self, admin_client, seed):
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}/for-shipment", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        expected = N_INVOICES - N_LINKED_SHIPMENTS
        assert len(data) == expected, f"expected {expected}, got {len(data)}"
        ids = {d["id"] for d in data}
        # oldest un-shipped invoice (index N_LINKED_SHIPMENTS) must be present
        assert f"{TEST_TAG}_INV_{N_LINKED_SHIPMENTS:04d}" in ids
        # invoices that already have a shipment must be excluded
        assert f"{TEST_TAG}_INV_0000" not in ids
        # annulled excluded
        assert not any(d.get("is_annulled") for d in data)


# ---------- wallet transactions ----------

class TestWalletTransactionsNoTruncation:
    def test_returns_all_transactions(self, admin_client, seed):
        r = admin_client.get(f"{API}/wallet/transactions/{seed['user_id']}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert len(data) == N_WALLET_TX, f"expected {N_WALLET_TX}, got {len(data)} (old limit was 50)"
        ids = {d["id"] for d in data}
        assert f"{TEST_TAG}_WTX_0000" in ids, "oldest wallet tx missing -> still truncated"
        assert not any(d["id"].startswith(f"{TEST_TAG}_WTXDEL") for d in data), "deleted tx leaked"
        created = [d["created_at"] for d in data]
        assert created == sorted(created, reverse=True)
        assert all("_id" not in d for d in data)


# ---------- purchase history ----------

class TestPurchaseHistoryNoTruncation:
    def test_returns_all_paid_purchases(self, admin_client, seed):
        r = admin_client.get(f"{API}/invoices/client/{CUSTOMER_ID}/history", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert len(data) == N_PAID_PURCHASES, f"expected {N_PAID_PURCHASES}, got {len(data)}"
        assert all(d["status"] == "paid" for d in data)
        ids = {d["id"] for d in data}
        assert f"{TEST_TAG}_PUR_0000" in ids, "oldest paid purchase missing -> still truncated"
        assert all("_id" not in d for d in data)


# ---------- shipments ----------

class TestUserShipmentsNoTruncation:
    def test_returns_all_shipments(self, admin_client, seed):
        r = admin_client.get(f"{API}/shipments/user/{seed['user_id']}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        total = N_LINKED_SHIPMENTS + N_EXTRA_SHIPMENTS
        assert len(data) == total, f"expected {total}, got {len(data)}"
        ids = {d["id"] for d in data}
        assert f"{TEST_TAG}_SHIPL_0000" in ids, "oldest shipment missing -> still truncated"
        created = [d["created_at"] for d in data]
        assert created == sorted(created, reverse=True)


# ---------- recalculate cascade ----------

class TestRecalculateCascadeFullHistory:
    def test_cascade_covers_all_invoices(self, admin_client, seed, mongo):
        r = admin_client.post(f"{API}/admin/recalculate-invoices/{CUSTOMER_ID}", timeout=180)
        assert r.status_code == 200, r.text[:300]

        docs = list(mongo.invoices.find(
            {"customer_id": CUSTOMER_ID, "is_annulled": {"$ne": True}},
            {"_id": 0, "id": 1, "created_at": 1, "total_a_pagar": 1, "saldo_pendiente": 1, "saldo_a_favor": 1},
        ).sort("created_at", 1))
        assert len(docs) == N_INVOICES
        # every invoice must have been touched by the cascade
        untouched = [d["id"] for d in docs if d.get("total_a_pagar") is None]
        assert not untouched, f"{len(untouched)} invoices not recalculated: {untouched[:5]}"
        # deterministic cascade: no approved deposits, total=10 each, debt accumulates
        for idx, d in enumerate(docs):
            assert d["saldo_pendiente"] == pytest.approx(idx * INVOICE_TOTAL), f"invoice #{idx}"
            assert d["total_a_pagar"] == pytest.approx((idx + 1) * INVOICE_TOTAL), f"invoice #{idx}"
            assert d["saldo_a_favor"] == 0
        assert docs[-1]["total_a_pagar"] == pytest.approx(N_INVOICES * INVOICE_TOTAL)

    def test_recalc_requires_admin(self, seed):
        login = requests.post(f"{API}/auth/login", json={"identifier": CUSTOMER_ID, "password": "123"}, timeout=30)
        token = login.json()["token"]
        r = requests.post(f"{API}/admin/recalculate-invoices/{CUSTOMER_ID}",
                          headers={"Authorization": f"Bearer {token}"}, timeout=60)
        assert r.status_code == 403


# ---------- regression: untouched global endpoints ----------

class TestGlobalEndpointsRegression:
    @pytest.mark.parametrize("path", [
        "/admin/clients", "/shipments", "/lives", "/admin/reports/business-stats",
        "/admin/reports/all-purchases", "/admin/reports/clients-debts",
    ])
    def test_global_endpoints_ok(self, admin_client, seed, path):
        r = admin_client.get(f"{API}{path}", timeout=90)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
