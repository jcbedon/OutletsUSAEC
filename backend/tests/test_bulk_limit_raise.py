"""
Iteration 18 regression: bulk raise of all `.to_list(N)` limits (N in {100,200,500,1000,2000}) to 20000.

Goals:
 1. Smoke ALL admin GET endpoints (no path params) -> 200, JSON, <5s  (no endpoint corrupted by regex)
 2. Prove NO truncation for the newly raised collections:
      - GET /api/lives            (was to_list(100))  -> seed 250 old lives
      - GET /api/shipments        (was to_list(500))  -> seed 600 old shipments
      - GET /api/invoices/search  (was to_list(1000)) -> DB parity
      - GET /api/wallet/all-deposits (kept at 20000)  -> DB parity
      - GET /api/admin/clients                        -> DB parity + new fields
 3. Regressions from iterations 14-17:
      - /admin/clients new fields (pending_to_invoice, pending_to_invoice_count, real_pending_balance)
      - /admin/clients/{cid}/diagnostics counts + monthly buckets
      - IDOR guard on /wallet/transactions/{user_id}
      - auth login still works (intentional to_list(10) preserved)
      - POST /admin/recalculate-invoices/{customer_id} cascade
      - POST /wallet/deposit-request-with-proof does not crash (OCR path)
"""
import io
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
TEST_TAG = "TEST_BULK18"
N_LIVES = 250
N_SHIPMENTS = 600
MAX_SECONDS = 5.0

ADMIN_GET_ENDPOINTS = [
    "/admin/audit-logs", "/admin/audit-logs/actions", "/admin/audit-logs/history",
    "/admin/audit-logs/users", "/admin/bank-accounts", "/admin/bank-accounts/summary",
    "/admin/bank-accounts/unassigned-recharges", "/admin/clients", "/admin/clients/active",
    "/admin/employees", "/admin/referrals",
    "/admin/reports/all-purchases", "/admin/reports/business-stats", "/admin/reports/buyers",
    "/admin/reports/clients-debts", "/admin/reports/clients-purchases",
    "/admin/reports/inactive-clients", "/admin/reports/invoices-without-shipment",
    "/admin/reports/purchases-without-tax", "/admin/reports/sales-detail",
    "/admin/reports/store-profits", "/admin/reports/summary", "/admin/settings",
    "/admin/settings/referral-bonus", "/admin/settings/shipping-categories", "/admin/tenant",
    "/auth/me", "/health", "/invoices/annulled", "/invoices/search", "/lives", "/lives/active",
    "/shipments", "/wallet/all-deposits", "/wallet/deleted-deposits", "/wallet/pending-deposits",
    "/wallet/recharge-report",
]


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    assert isinstance(data.get("token"), str) and data["token"]
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def tenant_id(mongo):
    u = mongo.users.find_one({"email": ADMIN["identifier"]}, {"_id": 0, "tenant_id": 1})
    assert u, "admin user not found in DB"
    return u["tenant_id"]


@pytest.fixture(scope="module")
def sample_client(mongo, tenant_id):
    """A real client of the tenant with wallet transactions."""
    tx = mongo.wallet_transactions.find_one({"tenant_id": tenant_id, "type": "deposit"}, {"_id": 0, "user_id": 1})
    user = mongo.users.find_one({"id": tx["user_id"]}, {"_id": 0}) if tx else None
    if not user:
        user = mongo.users.find_one({"tenant_id": tenant_id, "role": "client"}, {"_id": 0})
    assert user, "no client found for tenant"
    return user


@pytest.fixture(scope="module")
def loginable_clients(mongo, tenant_id):
    """Seed clients share password 123; some legacy/manual clients do not. Pick usable ones."""
    found = []
    for c in mongo.users.find({"tenant_id": tenant_id, "role": "client"}, {"_id": 0, "id": 1, "customer_id": 1}).limit(30):
        r = requests.post(f"{API}/auth/login", json={"identifier": c["customer_id"], "password": "123"}, timeout=60)
        if r.status_code == 200:
            found.append({**c, "token": r.json()["token"], "login_body": r.json()})
        if len(found) >= 2:
            break
    if len(found) < 2:
        pytest.fail("Could not log in with 2 seed clients using password '123'")
    return found


@pytest.fixture(scope="module")
def seeded_lives(mongo, tenant_id):
    """Seed N_LIVES historical lives (dates spread over 3 years) to defeat the old to_list(100)."""
    docs = []
    for i in range(N_LIVES):
        created = (datetime(2023, 1, 1, tzinfo=timezone.utc) + timedelta(days=i * 4)).isoformat()
        docs.append({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "title": f"{TEST_TAG}_LIVE_{i:04d}",
            "store": "TEST_STORE",
            "status": "ended",
            "created_at": created,
            "started_at": created,
            "ended_at": created,
            "total_purchases": 0,
            "total_amount": 0.0,
            "test_tag": TEST_TAG,
        })
    mongo.lives.insert_many(docs)
    yield docs
    mongo.lives.delete_many({"test_tag": TEST_TAG})


@pytest.fixture(scope="module")
def seeded_shipments(mongo, tenant_id, sample_client):
    docs = []
    for i in range(N_SHIPMENTS):
        created = (datetime(2023, 1, 1, tzinfo=timezone.utc) + timedelta(hours=i * 5)).isoformat()
        docs.append({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": sample_client["id"],
            "customer_id": sample_client.get("customer_id"),
            "tracking_number": f"{TEST_TAG}-{i:04d}",
            "invoice_ids": [],
            "purchase_ids": [],
            "status": "delivered",
            "shipping_cost": 0.0,
            "total_weight": 0.0,
            "created_at": created,
            "created_by": "TEST",
            "test_tag": TEST_TAG,
        })
    mongo.shipments.insert_many(docs)
    yield docs
    mongo.shipments.delete_many({"test_tag": TEST_TAG})


# ---------------- 1. smoke all admin GET endpoints ----------------

class TestAdminEndpointsSmoke:
    @pytest.mark.parametrize("path", ADMIN_GET_ENDPOINTS)
    def test_endpoint_ok_and_fast(self, path, admin_headers):
        t0 = time.time()
        r = requests.get(f"{API}{path}", headers=admin_headers, timeout=60)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"GET {path} -> {r.status_code}: {r.text[:300]}"
        body = r.json()  # must be valid JSON
        assert body is None or isinstance(body, (dict, list)), f"GET {path} unexpected body type"
        assert elapsed < MAX_SECONDS, f"GET {path} took {elapsed:.2f}s (>{MAX_SECONDS}s)"

    def test_diagnose_shipments_requires_dates_and_works(self, admin_headers):
        bad = requests.get(f"{API}/admin/diagnose-shipments", headers=admin_headers, timeout=60)
        assert bad.status_code == 400, f"expected 400 without dates, got {bad.status_code}"
        ok = requests.get(
            f"{API}/admin/diagnose-shipments",
            headers=admin_headers,
            params={"start_date": "2023-01-01", "end_date": "2027-01-01"},
            timeout=60,
        )
        assert ok.status_code == 200, ok.text[:300]
        assert isinstance(ok.json(), (dict, list))

    def test_no_mongo_object_id_leaked(self, admin_headers):
        for path in ["/admin/clients", "/lives", "/shipments", "/wallet/all-deposits", "/invoices/search"]:
            r = requests.get(f"{API}{path}", headers=admin_headers, timeout=60)
            assert r.status_code == 200
            assert '"_id"' not in r.text, f"{path} leaks mongo _id"


# ---------------- 2. no truncation ----------------

class TestNoTruncation:
    def test_lives_returns_full_history(self, admin_headers, seeded_lives, mongo, tenant_id):
        db_count = mongo.lives.count_documents({"tenant_id": tenant_id})
        assert db_count > 100, "seed failed to exceed the old limit"
        r = requests.get(f"{API}/lives", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]
        lives = r.json()
        assert isinstance(lives, list)
        assert len(lives) == db_count, f"lives truncated: API {len(lives)} vs DB {db_count}"
        titles = {l["title"] for l in lives}
        # oldest and newest seeded lives must both be present
        assert f"{TEST_TAG}_LIVE_0000" in titles, "oldest seeded live missing (truncation)"
        assert f"{TEST_TAG}_LIVE_{N_LIVES - 1:04d}" in titles
        # sorted desc by created_at
        dates = [l["created_at"] for l in lives]
        assert dates == sorted(dates, reverse=True), "lives not sorted newest-first"

    def test_lives_status_filter_not_truncated(self, admin_headers, seeded_lives, mongo, tenant_id):
        db_count = mongo.lives.count_documents({"tenant_id": tenant_id, "status": "ended"})
        r = requests.get(f"{API}/lives", headers=admin_headers, params={"status": "ended"}, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == db_count

    def test_shipments_returns_full_history(self, admin_headers, seeded_shipments, mongo, tenant_id):
        db_count = mongo.shipments.count_documents({"tenant_id": tenant_id})
        assert db_count > 500, "seed failed to exceed the old limit"
        t0 = time.time()
        r = requests.get(f"{API}/shipments", headers=admin_headers, timeout=60)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text[:300]
        shipments = r.json()
        assert len(shipments) == db_count, f"shipments truncated: API {len(shipments)} vs DB {db_count}"
        trackings = {s.get("tracking_number") for s in shipments}
        assert f"{TEST_TAG}-0000" in trackings, "oldest seeded shipment missing (truncation)"
        assert elapsed < MAX_SECONDS, f"/shipments with {db_count} rows took {elapsed:.2f}s"

    def test_invoices_search_db_parity(self, admin_headers, mongo, tenant_id):
        db_count = mongo.invoices.count_documents({"tenant_id": tenant_id})
        r = requests.get(f"{API}/invoices/search", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        items = body["invoices"] if isinstance(body, dict) and "invoices" in body else body
        assert len(items) == db_count, f"invoices truncated: API {len(items)} vs DB {db_count}"
        oldest = mongo.invoices.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1}).sort("created_at", 1).limit(1)[0]
        assert any(i.get("id") == oldest["id"] for i in items), "oldest invoice missing from search"

    def test_annulled_invoices_parity(self, admin_headers, mongo, tenant_id):
        db_count = mongo.invoices.count_documents({"tenant_id": tenant_id, "is_annulled": True})
        r = requests.get(f"{API}/invoices/annulled", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == db_count

    def test_all_deposits_parity(self, admin_headers, mongo, tenant_id):
        db_count = mongo.wallet_transactions.count_documents(
            {"tenant_id": tenant_id, "type": "deposit", "is_deleted": {"$ne": True}}
        )
        t0 = time.time()
        r = requests.get(f"{API}/wallet/all-deposits", headers=admin_headers, timeout=60)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text[:300]
        deposits = r.json()
        assert len(deposits) == db_count, f"deposits truncated: API {len(deposits)} vs DB {db_count}"
        assert all("customer_id" in d for d in deposits[:50])
        assert elapsed < MAX_SECONDS, f"/wallet/all-deposits took {elapsed:.2f}s"

    def test_admin_clients_parity_and_new_fields(self, admin_headers, mongo, tenant_id):
        db_count = mongo.users.count_documents({"tenant_id": tenant_id, "role": "client"})
        r = requests.get(f"{API}/admin/clients", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]
        clients = r.json()
        assert len(clients) == db_count, f"clients truncated: API {len(clients)} vs DB {db_count}"
        for c in clients[:10]:
            for field in ("pending_to_invoice", "pending_to_invoice_count", "real_pending_balance"):
                assert field in c, f"missing regression field {field} in /admin/clients"
            assert isinstance(c["pending_to_invoice_count"], int)
            assert isinstance(c["pending_to_invoice"], (int, float))
            assert isinstance(c["real_pending_balance"], (int, float))

    def test_client_wallet_history_full(self, admin_headers, mongo, sample_client):
        db_count = mongo.wallet_transactions.count_documents(
            {"user_id": sample_client["id"], "tenant_id": sample_client["tenant_id"], "is_deleted": {"$ne": True}}
        )
        r = requests.get(f"{API}/wallet/transactions/{sample_client['id']}", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == db_count


# ---------------- 3. regressions ----------------

class TestRegressions:
    def test_login_still_works_for_client(self, loginable_clients):
        data = loginable_clients[0]["login_body"]
        assert data["role"] == "client"
        assert data["customer_id"].upper() == loginable_clients[0]["customer_id"].upper()
        assert data["user_id"] == loginable_clients[0]["id"]
        assert data["tenant_id"]
        assert isinstance(data["token"], str) and data["token"]

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": ADMIN["identifier"], "password": "wrong"}, timeout=60)
        assert r.status_code in (400, 401), r.status_code

    def test_diagnostics_counts_and_months(self, admin_headers, mongo, sample_client):
        cid = sample_client["customer_id"]
        r = requests.get(f"{API}/admin/clients/{cid}/diagnostics", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for block in ("invoices", "purchases", "wallet_transactions", "shipments"):
            assert block in d, f"diagnostics missing block {block}"
        wallet_db = mongo.wallet_transactions.count_documents(
            {"user_id": sample_client["id"], "tenant_id": sample_client["tenant_id"]}
        )
        wb = d["wallet_transactions"]
        total = wb.get("total", wb.get("count"))
        assert total == wallet_db, f"diagnostics wallet count {total} != DB {wallet_db}"
        by_month = wb.get("by_month") or []
        if by_month:
            months = [m["month"] for m in by_month]
            assert months == sorted(months), "by_month not sorted ascending"
            assert sum(m["count"] for m in by_month) == total

    def test_idor_guard_wallet_transactions(self, loginable_clients):
        me, other = loginable_clients[0], loginable_clients[1]
        h = {"Authorization": f"Bearer {me['token']}"}
        own = requests.get(f"{API}/wallet/transactions/{me['id']}", headers=h, timeout=60)
        assert own.status_code == 200
        foreign = requests.get(f"{API}/wallet/transactions/{other['id']}", headers=h, timeout=60)
        assert foreign.status_code == 403, f"IDOR: expected 403, got {foreign.status_code}"

    def test_recalculate_invoices_cascade(self, admin_headers, mongo, sample_client):
        cid = sample_client["customer_id"]
        before = list(mongo.invoices.find({"customer_id": cid}, {"_id": 0, "id": 1, "total": 1}))
        t0 = time.time()
        r = requests.post(f"{API}/admin/recalculate-invoices/{cid}", headers=admin_headers, timeout=120)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"recalc failed {r.status_code}: {r.text[:400]}"
        after = list(mongo.invoices.find({"customer_id": cid}, {"_id": 0, "id": 1, "total": 1}))
        assert len(after) == len(before), "recalc changed the invoice count"
        print(f"recalc {cid}: {elapsed:.2f}s, invoices={len(after)}, resp={str(r.json())[:200]}")

    def test_deposit_with_proof_ocr_and_duplicate_guard(self, mongo, loginable_clients, tenant_id):
        """OCR anti-fraud (iteration_15): mismatch/duplicate must be blocked; OCR down must not 500."""
        me = loginable_clients[0]
        h = {"Authorization": f"Bearer {me['token']}"}
        try:
            from PIL import Image
            buf = io.BytesIO()
            Image.new("RGB", (400, 300), (245, 245, 245)).save(buf, format="PNG")
            png = buf.getvalue()
        except Exception:
            png = b"\x89PNG\r\n\x1a\n" + b"0" * 2000
        ref = f"{TEST_TAG}{uuid.uuid4().hex[:8].upper()}"
        files = {"file": (f"{TEST_TAG}_proof.png", io.BytesIO(png), "image/png")}
        data = {"user_id": me["id"], "amount": "1.0", "reference_number": ref,
                "description": f"{TEST_TAG} deposit"}
        resp = requests.post(f"{API}/wallet/deposit-request-with-proof", headers=h,
                             files=files, data=data, timeout=180)
        print(f"deposit-with-proof -> {resp.status_code}: {resp.text[:300]}")
        if resp.status_code == 500 and "almacenamiento" in resp.text:
            # ENV LIMITATION (reported): EMERGENT_LLM_KEY missing in backend/.env ->
            # object_store.upload_file() raises, so proof upload + OCR cannot run here.
            pytest.skip("Object storage unavailable in this env (EMERGENT_LLM_KEY not set) - reported to main agent")
        assert resp.status_code != 500, f"deposit-with-proof crashed (500): {resp.text[:500]}"
        # 400 = OCR read a different reference (anti-fraud active); 200 = OCR unavailable/blank image
        assert resp.status_code in (200, 400, 409), resp.text[:300]
        txid = None
        if resp.status_code == 200:
            txid = resp.json().get("transaction_id")
            assert txid
            saved = mongo.wallet_transactions.find_one({"id": txid}, {"_id": 0})
            assert saved and saved["status"] == "pending"
            assert saved["reference_number"] == ref
            # duplicate reference must be rejected with 409
            dup = requests.post(
                f"{API}/wallet/deposit-request-with-proof", headers=h,
                files={"file": (f"{TEST_TAG}_proof.png", io.BytesIO(png), "image/png")},
                data=data, timeout=180)
            assert dup.status_code == 409, f"duplicate reference not blocked: {dup.status_code} {dup.text[:200]}"
        # cleanup
        mongo.wallet_transactions.delete_many({"reference_number": ref})

    def test_deposit_with_proof_requires_proof_for_client(self, loginable_clients):
        me = loginable_clients[0]
        h = {"Authorization": f"Bearer {me['token']}"}
        r = requests.post(f"{API}/wallet/deposit-request-with-proof", headers=h,
                          data={"user_id": me["id"], "amount": "5", "reference_number": f"{TEST_TAG}NOFILE"},
                          timeout=60)
        assert r.status_code == 400, f"expected 400 without proof file, got {r.status_code}: {r.text[:200]}"

    def test_client_cannot_list_all_deposits(self, loginable_clients):
        h = {"Authorization": f"Bearer {loginable_clients[0]['token']}"}
        for path in ["/wallet/all-deposits", "/admin/clients", "/shipments"]:
            r = requests.get(f"{API}{path}", headers=h, timeout=60)
            assert r.status_code == 403, f"{path} allowed a client token ({r.status_code})"
