"""
Retest (iteration_17) of the iteration_16 residual defects:
  1. IDOR guard on GET /api/wallet/transactions/{user_id}
  2. IDOR guard on GET /api/shipments/user/{user_id}
  3. /invoices/client/{cid}/for-shipment: per-client shipment map (no tenant-wide truncation)
  4. /invoices/client/{cid}/for-shipment: purchases no longer truncated at 100
  5. recalculate_client_invoices shipping self-heal over >1000 invoices (to_list 5000)
  + regression of the endpoints fixed in iteration_16.
Self-seeding via pymongo, module-scoped fixtures with teardown.
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
EMPLOYEE = {"identifier": "maria@outletsusaec.com", "password": "empleado123"}
VICTIM_CID = "A2824"
CID = "TSTR"          # client under test (attacker / owner)
TAG = "TEST_RETEST"
N_NOISE_SHIPMENTS = 3000
N_PURCHASES = 250     # > 100 -> exposes the old to_list(100)
N_BIG_INVOICES = 1200  # > 1000 -> exposes the old to_list(1000) in recalc self-heal
START = datetime(2023, 6, 1, 12, 0, 0, tzinfo=timezone.utc)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def db():
    c = MongoClient(backend_env["MONGO_URL"])
    yield c[backend_env["DB_NAME"]]
    c.close()


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=30)
    assert r.status_code == 200, f"login {payload['identifier']} -> {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def admin():
    data = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.tenant_id = data["tenant_id"]
    return s


@pytest.fixture(scope="module")
def employee():
    data = _login(EMPLOYEE)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


def _clean(db):
    db.users.delete_many({"customer_id": CID})
    db.invoices.delete_many({"customer_id": CID})
    db.shipments.delete_many({"customer_id": CID})
    db.wallet_transactions.delete_many({"id": {"$regex": f"^{TAG}_"}})
    db.wallets.delete_many({"customer_id": CID})
    db.purchases.delete_many({"id": {"$regex": f"^{TAG}_"}})
    db.shipments.delete_many({"id": {"$regex": f"^{TAG}_NOISE"}})


@pytest.fixture(scope="module")
def seed(db, admin):
    tid = admin.tenant_id
    _clean(db)
    sample = db.users.find_one({"role": "client", "tenant_id": tid, "customer_id": VICTIM_CID})
    assert sample, f"seed client {VICTIM_CID} missing"
    user_id = f"{TAG}_USER"
    db.users.insert_one({
        "id": user_id, "tenant_id": tid, "customer_id": CID, "name": f"{TAG} client",
        "email": f"{TAG.lower()}@example.test", "role": "client",
        "password_hash": sample["password_hash"], "created_at": START.isoformat(),
    })
    db.wallets.insert_one({
        "id": f"{TAG}_WALLET", "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "balance": 0.0, "created_at": START.isoformat(),
    })
    # own wallet transactions (3) -> owner must see them
    db.wallet_transactions.insert_many([{
        "id": f"{TAG}_TX_{i}", "tenant_id": tid, "user_id": user_id, "type": "deposit",
        "amount": 10.0, "status": "approved", "description": f"{TAG} tx {i}",
        "created_at": (START + timedelta(days=i)).isoformat(),
    } for i in range(3)])

    # A) invoice already shipped (per-client shipment map check)
    db.invoices.insert_one({
        "id": f"{TAG}_SHIPPED_INV", "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "invoice_number": f"{TAG}-0001", "purchase_ids": [], "subtotal": 10.0, "total_tax": 0.0,
        "total_commission": 0.0, "total": 10.0, "shipping_cost": 0.0, "saldo_pendiente": 0.0,
        "status": "approved", "is_annulled": False, "created_at": START.isoformat(),
    })
    # B) invoice with 250 purchases, NOT shipped
    purchase_ids = [f"{TAG}_PUR_{i:04d}" for i in range(N_PURCHASES)]
    db.purchases.insert_many([{
        "id": pid, "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "store": "TestStore", "product_name": f"{TAG} item {i}", "amount": 1.0,
        "tax": 0.0, "commission": 0.0, "total": 1.0, "status": "paid",
        "created_at": (START + timedelta(minutes=i)).isoformat(),
    } for i, pid in enumerate(purchase_ids)])
    db.invoices.insert_one({
        "id": f"{TAG}_BIG_INV", "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "invoice_number": f"{TAG}-0002", "purchase_ids": purchase_ids, "subtotal": 250.0,
        "total_tax": 0.0, "total_commission": 0.0, "total": 250.0, "shipping_cost": 0.0,
        "saldo_pendiente": 250.0, "status": "approved", "is_annulled": False,
        "created_at": (START + timedelta(days=1)).isoformat(),
    })
    # C) 1200 old invoices with orphan shipping_cost > 0 (self-heal target)
    db.invoices.insert_many([{
        "id": f"{TAG}_ORPH_{i:05d}", "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "invoice_number": f"{TAG}-O{i:05d}", "purchase_ids": [], "subtotal": 0.0,
        "total_tax": 0.0, "total_commission": 0.0, "total": 5.0, "shipping_cost": 5.0,
        "weight_pounds": 2.0, "shipment_id": None, "saldo_pendiente": 5.0,
        "status": "approved", "is_annulled": False,
        "created_at": (START + timedelta(days=10, minutes=i)).isoformat(),
    } for i in range(N_BIG_INVOICES)])

    # tenant-wide noise shipments carrying invoice_id (>1000)
    db.shipments.insert_many([{
        "id": f"{TAG}_NOISE_{i:05d}", "tenant_id": tid, "user_id": f"{TAG}_OTHER",
        "customer_id": "ZZZZ", "purchase_ids": [], "invoice_id": f"{TAG}_NOISE_INV_{i:05d}",
        "shipping_cost": 0.0, "status": "pending",
        "created_at": (START + timedelta(minutes=i)).isoformat(),
    } for i in range(N_NOISE_SHIPMENTS)])
    # this client's shipment inserted LAST -> outside the old to_list(1000) natural window
    db.shipments.insert_one({
        "id": f"{TAG}_SHIP", "tenant_id": tid, "user_id": user_id, "customer_id": CID,
        "purchase_ids": [], "invoice_id": f"{TAG}_SHIPPED_INV", "shipping_cost": 0.0,
        "status": "pending", "created_at": (START + timedelta(days=2)).isoformat(),
    })
    yield {"user_id": user_id, "tenant_id": tid}
    _clean(db)


@pytest.fixture(scope="module")
def client_session(seed):
    data = _login({"identifier": CID, "password": "123"})
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.user_id = data["user_id"]
    return s


@pytest.fixture(scope="module")
def victim_user_id(seed):
    return _login({"identifier": VICTIM_CID, "password": "123"})["user_id"]


# ---------- 1) IDOR wallet transactions ----------
class TestWalletTransactionsIDOR:
    def test_client_cannot_read_other_user(self, client_session, victim_user_id):
        r = client_session.get(f"{API}/wallet/transactions/{victim_user_id}", timeout=30)
        assert r.status_code == 403, f"IDOR: got {r.status_code} body={r.text[:200]}"

    def test_client_reads_own(self, client_session, seed):
        r = client_session.get(f"{API}/wallet/transactions/{client_session.user_id}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert isinstance(rows, list)
        assert len([x for x in rows if x["id"].startswith(f"{TAG}_TX_")]) == 3
        assert all("_id" not in x for x in rows)

    def test_admin_reads_any(self, admin, victim_user_id):
        r = admin.get(f"{API}/wallet/transactions/{victim_user_id}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_employee_reads_any(self, employee, victim_user_id):
        r = employee.get(f"{API}/wallet/transactions/{victim_user_id}", timeout=30)
        assert r.status_code == 200, r.text[:200]

    def test_no_token_rejected(self, victim_user_id):
        r = requests.get(f"{API}/wallet/transactions/{victim_user_id}", timeout=30)
        assert r.status_code in (401, 403, 422), r.status_code


# ---------- 2) IDOR shipments/user ----------
class TestShipmentsUserIDOR:
    def test_client_cannot_read_other_user(self, client_session, victim_user_id):
        r = client_session.get(f"{API}/shipments/user/{victim_user_id}", timeout=30)
        assert r.status_code == 403, f"IDOR: got {r.status_code} body={r.text[:200]}"

    def test_client_reads_own(self, client_session, seed):
        r = client_session.get(f"{API}/shipments/user/{client_session.user_id}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert [x["id"] for x in rows] == [f"{TAG}_SHIP"]

    def test_admin_reads_any(self, admin, seed):
        r = admin.get(f"{API}/shipments/user/{seed['user_id']}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert len(r.json()) == 1

    def test_employee_reads_any(self, employee, seed):
        r = employee.get(f"{API}/shipments/user/{seed['user_id']}", timeout=30)
        assert r.status_code == 200, r.text[:200]


# ---------- 3 & 4) for-shipment ----------
class TestForShipment:
    def test_shipped_invoice_excluded_with_3000_tenant_shipments(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID}/for-shipment", timeout=120)
        assert r.status_code == 200, r.text[:300]
        ids = [i["id"] for i in r.json()]
        assert f"{TAG}_SHIPPED_INV" not in ids, "already-shipped invoice offered again for shipment"
        assert f"{TAG}_BIG_INV" in ids, "un-shipped invoice missing from for-shipment list"

    def test_purchases_not_truncated_at_100(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID}/for-shipment", timeout=120)
        assert r.status_code == 200
        big = next(i for i in r.json() if i["id"] == f"{TAG}_BIG_INV")
        assert big["purchase_count"] == N_PURCHASES, f"purchase_count={big['purchase_count']}"
        assert len(big["purchases"]) == N_PURCHASES, f"purchases len={len(big['purchases'])}"
        assert all("_id" not in p for p in big["purchases"])

    def test_all_1200_orphan_invoices_present(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID}/for-shipment", timeout=120)
        ids = {i["id"] for i in r.json()}
        assert len([i for i in ids if i.startswith(f"{TAG}_ORPH_")]) == N_BIG_INVOICES

    def test_client_role_forbidden(self, client_session):
        r = client_session.get(f"{API}/invoices/client/{CID}/for-shipment", timeout=60)
        assert r.status_code == 403, r.status_code


# ---------- 5) recalc shipping self-heal over >1000 invoices ----------
class TestRecalcSelfHeal:
    def test_selfheal_visits_all_invoices(self, admin, db, seed):
        tid = seed["tenant_id"]
        before = db.invoices.count_documents(
            {"tenant_id": tid, "customer_id": CID, "shipping_cost": {"$gt": 0}})
        assert before == N_BIG_INVOICES, f"seed check: {before}"
        t0 = time.time()
        r = admin.post(f"{API}/admin/recalculate-invoices/{CID}", timeout=300)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text[:300]
        left = db.invoices.count_documents(
            {"tenant_id": tid, "customer_id": CID, "shipping_cost": {"$gt": 0}})
        assert left == 0, (
            f"self-heal left {left}/{before} invoices with orphan shipping_cost "
            "(to_list cap inside recalculate_client_invoices)"
        )
        print(f"recalc over {before + 2} invoices took {elapsed:.2f}s")

    def test_small_client_no_regression(self, admin):
        r = admin.post(f"{API}/admin/recalculate-invoices/{VICTIM_CID}", timeout=120)
        assert r.status_code == 200, r.text[:300]
        inv = admin.get(f"{API}/invoices/client/{VICTIM_CID}", timeout=60)
        assert inv.status_code == 200
        assert isinstance(inv.json(), list)


# ---------- regression of iteration_16 endpoints ----------
class TestRegression:
    def test_invoices_client_full_history(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID}", timeout=120)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert len(rows) == N_BIG_INVOICES + 2, len(rows)
        dates = [x["created_at"] for x in rows]
        assert dates == sorted(dates, reverse=True), "not DESC"
        assert all("_id" not in x for x in rows)

    def test_invoices_client_case_insensitive(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID.lower()}", timeout=120)
        assert r.status_code == 200
        assert len(r.json()) == N_BIG_INVOICES + 2

    def test_client_history_endpoint(self, admin, seed):
        r = admin.get(f"{API}/invoices/client/{CID}/history", timeout=120)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        rows = data if isinstance(data, list) else data.get("purchases", data)
        assert isinstance(rows, (list, dict))
        if isinstance(rows, list):
            assert len(rows) == N_PURCHASES, len(rows)

    def test_client_sees_own_invoices(self, client_session, seed):
        r = client_session.get(f"{API}/invoices/client/{CID}", timeout=120)
        assert r.status_code == 200, r.text[:200]
        assert len(r.json()) == N_BIG_INVOICES + 2

    def test_client_blocked_on_other_client_invoices(self, client_session):
        r = client_session.get(f"{API}/invoices/client/{VICTIM_CID}", timeout=60)
        assert r.status_code == 403, r.status_code

    def test_core_admin_endpoints(self, admin):
        for path in ["/admin/clients", "/shipments", "/lives",
                     "/admin/reports/business-stats", "/admin/reports/clients-debts"]:
            r = admin.get(f"{API}{path}", timeout=120)
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:150]}"
