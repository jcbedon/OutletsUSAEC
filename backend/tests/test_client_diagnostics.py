"""
Iteration 17: GET /api/admin/clients/{customer_id}/diagnostics
+ quick regression of iteration_16 IDOR guards / no-truncation history endpoints.
"""
import os

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
EMPLOYEE = {"identifier": "maria@outletsusaec.com", "password": "empleado123"}
SEED_CID = "C5557"


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=60)
    assert r.status_code == 200, f"login {payload['identifier']} -> {r.status_code} {r.text[:300]}"
    return r.json()


@pytest.fixture(scope="module")
def db():
    c = MongoClient(backend_env["MONGO_URL"])
    yield c[backend_env["DB_NAME"]]
    c.close()


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


@pytest.fixture(scope="module")
def client_session(db, admin):
    """A seed client (role=client) session + its user doc."""
    u = db.users.find_one({"tenant_id": admin.tenant_id, "customer_id": SEED_CID, "role": "client"})
    assert u, f"seed client {SEED_CID} missing"
    data = _login({"identifier": SEED_CID, "password": "123"})
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.user_id = u["id"]
    return s


# ---------- diagnostics endpoint ----------
class TestDiagnostics:
    def test_admin_200_and_structure(self, admin, db):
        r = admin.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        for k in ["user", "invoices", "purchases", "wallet_transactions", "shipments"]:
            assert k in d, f"missing block {k}"
        u = d["user"]
        for k in ["id", "customer_id", "customer_id_case_matches_input", "name", "email",
                  "whatsapp", "created_at", "is_active", "role"]:
            assert k in u, f"missing user.{k}"
        assert u["customer_id"] == SEED_CID
        assert u["customer_id_case_matches_input"] is True
        assert u["role"] == "client"
        assert isinstance(u["created_at"], str) and len(u["created_at"]) >= 10

        for k in ["invoices", "purchases"]:
            b = d[k]
            for f in ["total_strict_customer_id", "total_case_insensitive",
                      "oldest_created_at", "newest_created_at", "by_month"]:
                assert f in b, f"missing {k}.{f}"
            assert isinstance(b["total_strict_customer_id"], int)
            assert isinstance(b["by_month"], list)
        assert "annulled" in d["invoices"]
        for f in ["total", "soft_deleted", "deposits", "oldest_created_at", "newest_created_at", "by_month"]:
            assert f in d["wallet_transactions"], f"missing wallet_transactions.{f}"
        for f in ["total", "oldest_created_at", "newest_created_at", "by_month"]:
            assert f in d["shipments"], f"missing shipments.{f}"
        # no mongo _id leaked anywhere (top-level keys only; "customer_id" contains "_id")
        assert "_id" not in u and "_id" not in d

    def test_counts_match_db(self, admin, db):
        r = admin.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60)
        assert r.status_code == 200
        d = r.json()
        tid = admin.tenant_id
        uid = d["user"]["id"]
        assert d["invoices"]["total_strict_customer_id"] == db.invoices.count_documents(
            {"tenant_id": tid, "customer_id": SEED_CID})
        assert d["purchases"]["total_strict_customer_id"] == db.purchases.count_documents(
            {"tenant_id": tid, "customer_id": SEED_CID})
        assert d["wallet_transactions"]["total"] == db.wallet_transactions.count_documents(
            {"tenant_id": tid, "user_id": uid})
        assert d["shipments"]["total"] == db.shipments.count_documents(
            {"tenant_id": tid, "user_id": uid})
        assert d["invoices"]["total_strict_customer_id"] > 0, "seed client has no invoices"
        assert d["wallet_transactions"]["total"] > 0, "seed client has no wallet transactions"

    def test_by_month_format_sorted_and_sums(self, admin):
        d = admin.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60).json()
        for block in ["invoices", "purchases", "wallet_transactions", "shipments"]:
            months = [m["month"] for m in d[block]["by_month"]]
            for m in months:
                assert len(m) == 7 and m[4] == "-", f"{block} bad month key {m}"
                int(m[:4]); int(m[5:7])
            assert months == sorted(months), f"{block} by_month not ASC: {months}"
            total_key = "total_strict_customer_id" if block in ("invoices", "purchases") else "total"
            assert sum(m["count"] for m in d[block]["by_month"]) == d[block][total_key], \
                f"{block} by_month sum != {total_key}"

    def test_lowercase_input_resolves(self, admin):
        r = admin.get(f"{API}/admin/clients/{SEED_CID.lower()}/diagnostics", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["user"]["customer_id"] == SEED_CID
        assert d["user"]["customer_id_case_matches_input"] is True

    def test_case_insensitive_fallback(self, admin, db):
        """Insert a client whose stored customer_id has odd casing -> found via regex fallback."""
        tid = admin.tenant_id
        stored = "TsTd1"
        db.users.delete_many({"tenant_id": tid, "customer_id": {"$regex": "^TSTD1$", "$options": "i"}})
        db.users.insert_one({
            "id": "TEST_diag_case_user", "tenant_id": tid, "customer_id": stored,
            "role": "client", "name": "TEST_CaseDrift", "email": "test_casedrift@example.test",
            "whatsapp": "0000", "is_active": True, "created_at": "2025-04-10T10:00:00",
        })
        try:
            r = admin.get(f"{API}/admin/clients/TSTD1/diagnostics", timeout=60)
            assert r.status_code == 200, r.text[:300]
            d = r.json()
            assert d["user"]["customer_id"] == stored
            assert d["user"]["customer_id_case_matches_input"] is False
        finally:
            db.users.delete_one({"id": "TEST_diag_case_user"})

    def test_404_unknown(self, admin):
        r = admin.get(f"{API}/admin/clients/NOEXISTE/diagnostics", timeout=60)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"
        assert "no encontrado" in r.json().get("detail", "").lower()

    def test_employee_allowed(self, employee):
        r = employee.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60)
        assert r.status_code == 200, f"employee -> {r.status_code} {r.text[:300]}"

    def test_client_forbidden(self, client_session):
        r = client_session.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60)
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_no_token_unauthorized(self):
        r = requests.get(f"{API}/admin/clients/{SEED_CID}/diagnostics", timeout=60)
        # NOTE: app-wide behaviour returns 422 for a missing Authorization header
        # (should ideally be 401) - tracked as a minor issue, not a diagnostics bug.
        assert r.status_code in (401, 403, 422), r.status_code


# ---------- iteration_16 regression ----------
class TestIdorRegression:
    def test_wallet_own(self, client_session):
        r = client_session.get(f"{API}/wallet/transactions/{client_session.user_id}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), (list, dict))

    def test_wallet_other_403(self, client_session, db, admin):
        other = db.users.find_one({"tenant_id": admin.tenant_id, "role": "client",
                                   "id": {"$ne": client_session.user_id}})
        assert other
        r = client_session.get(f"{API}/wallet/transactions/{other['id']}", timeout=60)
        assert r.status_code == 403, f"IDOR: {r.status_code}"

    def test_shipments_own(self, client_session):
        r = client_session.get(f"{API}/shipments/user/{client_session.user_id}", timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_shipments_other_403(self, client_session, db, admin):
        other = db.users.find_one({"tenant_id": admin.tenant_id, "role": "client",
                                   "id": {"$ne": client_session.user_id}})
        r = client_session.get(f"{API}/shipments/user/{other['id']}", timeout=60)
        assert r.status_code == 403, f"IDOR: {r.status_code}"

    def test_for_shipment_excludes_invoices_with_shipment(self, admin, db):
        r = admin.get(f"{API}/invoices/client/{SEED_CID}/for-shipment", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        invs = data.get("invoices", data) if isinstance(data, dict) else data
        assert isinstance(invs, list)
        for inv in invs:
            assert not inv.get("shipment_id"), f"invoice {inv.get('invoice_number')} already shipped"
