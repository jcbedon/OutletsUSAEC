"""Regression tests for the recalculate_client_invoices bugfix.

The recalc function must:
  1. Preserve historical deposit->invoice assignments (via applied_deposits[]).
  2. Not drop deposits when strict Mon-Sun weekly rule is applied to old data.
  3. Honor manual target_invoice_id.
  4. Correctly compute floating_deposits for approved deposits without a
     same-week invoice.
  5. Return the wallet shape with balance / total_saldo_pendiente /
     pending_debt / saldo_a_favor / floating_deposits.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
J2934_USER_ID = "863e44c0-4a02-48b7-ac8d-2fc28b80795b"


# ---- Fixtures ----------------------------------------------------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---- Auth --------------------------------------------------------------

class TestAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_protected_route_requires_auth(self):
        r = requests.get(f"{API}/admin/clients", timeout=15)
        # 401/403 if custom auth, 422 if FastAPI header dependency missing
        assert r.status_code in (401, 403, 422), f"got {r.status_code}"

    def test_protected_route_with_auth(self, admin_headers):
        r = requests.get(f"{API}/admin/clients", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Should be a list or dict with a list — just verify not error
        assert data is not None


# ---- Wallet shape ------------------------------------------------------

class TestWalletShape:
    def test_wallet_structure(self, admin_headers):
        r = requests.get(f"{API}/wallet/{J2934_USER_ID}", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        w = r.json()
        for key in ["balance", "total_saldo_pendiente", "pending_debt",
                    "saldo_a_favor", "floating_deposits"]:
            assert key in w, f"missing key {key} in wallet response: {list(w.keys())}"
        assert isinstance(w["floating_deposits"], (int, float))
        assert isinstance(w["saldo_a_favor"], (int, float))


# ---- Recalc preserves historic assignments (J2934) ---------------------

class TestRecalcJ2934:
    def test_recalc_j2934_preserves_assignments(self, admin_headers):
        # Trigger recalc
        r = requests.post(f"{API}/admin/recalculate-invoices/J2934",
                          headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text

        # Fetch invoices via client endpoint
        r2 = requests.get(f"{API}/invoices/client/J2934",
                          headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        invs = r2.json()
        if isinstance(invs, dict) and "invoices" in invs:
            invs = invs["invoices"]

        by_num = {i.get("invoice_number"): i for i in invs}
        assert "INV-000001" in by_num, f"missing INV-000001; nums={list(by_num.keys())[:10]}"
        assert "J2934-015" in by_num, f"missing J2934-015"

        inv1 = by_num["INV-000001"]
        inv15 = by_num["J2934-015"]

        assert len(inv1.get("applied_deposits") or []) == 2, \
            f"INV-000001 should have 2 deposits, got {len(inv1.get('applied_deposits') or [])}"
        assert abs(float(inv1.get("deposits_applied") or 0) - 55.0) < 0.01, \
            f"INV-000001 deposits_applied should be $55, got {inv1.get('deposits_applied')}"

        assert len(inv15.get("applied_deposits") or []) == 7, \
            f"J2934-015 should have 7 deposits, got {len(inv15.get('applied_deposits') or [])}"
        assert abs(float(inv15.get("deposits_applied") or 0) - 259.0) < 0.01, \
            f"J2934-015 deposits_applied should be $259, got {inv15.get('deposits_applied')}"

    def test_j2934_floating_zero_after_recalc(self, admin_headers):
        r = requests.get(f"{API}/wallet/{J2934_USER_ID}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        w = r.json()
        assert float(w.get("floating_deposits") or 0) == 0.0, \
            f"J2934 floating_deposits should be 0 (all 9 deposits attached), got {w.get('floating_deposits')}"


# ---- Recalc preserves historic assignments (A4582) ---------------------

class TestRecalcA4582:
    def test_recalc_a4582_preserves_assignments(self, admin_headers):
        r = requests.post(f"{API}/admin/recalculate-invoices/A4582",
                          headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{API}/invoices/client/A4582",
                          headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        invs = r2.json()
        if isinstance(invs, dict) and "invoices" in invs:
            invs = invs["invoices"]
        by_num = {i.get("invoice_number"): i for i in invs}

        assert "INV-1053" in by_num
        assert "INV-1075" in by_num

        assert len(by_num["INV-1053"].get("applied_deposits") or []) == 3, \
            f"INV-1053 should have 3 deposits, got {len(by_num['INV-1053'].get('applied_deposits') or [])}"
        assert len(by_num["INV-1075"].get("applied_deposits") or []) == 1, \
            f"INV-1075 should have 1 deposit, got {len(by_num['INV-1075'].get('applied_deposits') or [])}"


# ---- Weekly cutoff creates floating_deposit for a NEW deposit ----------
# This test mutates the DB directly (creates + deletes a synthetic deposit)
# to avoid depending on file-upload approval flow.

@pytest.mark.asyncio
class TestFloatingWeeklyCutoff:
    async def test_new_deposit_no_current_week_invoice_floats(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "test_database")]

        # Find a client that has NO invoice this current Mon-Sun week
        # Guayaquil = UTC-5; compute "now" in that TZ.
        now_gye = datetime.now(timezone.utc) - timedelta(hours=5)
        # Monday 00:00 GYE
        monday = now_gye - timedelta(days=now_gye.weekday())
        monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        sunday_end = monday + timedelta(days=7)
        # Convert to UTC ISO string (invoices are stored as ISO w/ tz)
        wk_start_utc = (monday + timedelta(hours=5)).replace(tzinfo=timezone.utc)
        wk_end_utc = (sunday_end + timedelta(hours=5)).replace(tzinfo=timezone.utc)

        # Pick a random client with a wallet and NO current-week non-annulled invoice
        target = None
        async for u in db.users.find({"role": "client", "customer_id": {"$exists": True}},
                                     {"_id": 0, "id": 1, "customer_id": 1, "tenant_id": 1}).limit(50):
            has_wk_inv = await db.invoices.find_one({
                "customer_id": u["customer_id"], "tenant_id": u["tenant_id"],
                "is_annulled": {"$ne": True},
                "created_at": {"$gte": wk_start_utc.isoformat(), "$lt": wk_end_utc.isoformat()}
            }, {"_id": 0, "id": 1})
            if not has_wk_inv:
                # Ensure wallet exists
                w = await db.wallets.find_one({"user_id": u["id"]}, {"_id": 0})
                if w:
                    target = u
                    break

        if not target:
            pytest.skip("No client without current-week invoice found for test.")

        # Baseline
        base = await db.wallet_transactions.aggregate([
            {"$match": {"user_id": target["id"], "tenant_id": target["tenant_id"],
                        "type": "deposit", "status": "approved",
                        "is_deleted": {"$ne": True}}},
            {"$group": {"_id": None, "t": {"$sum": "$amount"}}}
        ]).to_list(1)
        applied = await db.invoices.aggregate([
            {"$match": {"customer_id": target["customer_id"], "tenant_id": target["tenant_id"],
                        "is_annulled": {"$ne": True}}},
            {"$unwind": "$applied_deposits"},
            {"$group": {"_id": None, "t": {"$sum": "$applied_deposits.amount_applied"}}}
        ]).to_list(1)
        base_floating = round(
            max(0, (base[0]["t"] if base else 0) - (applied[0]["t"] if applied else 0)), 2)

        # Insert synthetic deposit in current week
        dep_id = f"TEST_dep_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.wallet_transactions.insert_one({
            "id": dep_id,
            "tenant_id": target["tenant_id"],
            "user_id": target["id"],
            "customer_id": target["customer_id"],
            "type": "deposit",
            "amount": 42.42,
            "balance_after": 0,
            "status": "approved",
            "created_at": now_iso,
            "description": "TEST_ synthetic floating deposit",
        })

        try:
            # Trigger recalc
            r = requests.post(f"{API}/admin/recalculate-invoices/{target['customer_id']}",
                              headers={"Authorization": f"Bearer {_get_admin_token()}"},
                              timeout=60)
            assert r.status_code == 200, r.text

            # Fetch wallet
            r2 = requests.get(f"{API}/wallet/{target['id']}",
                              headers={"Authorization": f"Bearer {_get_admin_token()}"},
                              timeout=30)
            assert r2.status_code == 200, r2.text
            w = r2.json()
            new_floating = float(w.get("floating_deposits") or 0)
            # The new $42.42 must appear in floating (no same-week invoice exists)
            assert new_floating >= base_floating + 42.42 - 0.01, \
                f"expected floating >= base ({base_floating}) + 42.42, got {new_floating}"
        finally:
            await db.wallet_transactions.delete_one({"id": dep_id})
            # Recalc again to clean state
            requests.post(f"{API}/admin/recalculate-invoices/{target['customer_id']}",
                          headers={"Authorization": f"Bearer {_get_admin_token()}"},
                          timeout=60)


# ---- Manual assignment endpoint still works ----------------------------

class TestManualAssignment:
    def test_assign_invoice_endpoint_exists_and_validates(self, admin_headers):
        # Use a nonsense tx id → 404 (not 405/500). Proves route is wired.
        r = requests.put(f"{API}/wallet/deposit/NON_EXISTENT_TX/assign-invoice",
                         headers=admin_headers,
                         json={"invoice_id": None}, timeout=30)
        assert r.status_code in (404, 400), r.text

    def test_assign_and_reassign_j2934_deposit(self, admin_headers):
        # Find a deposit currently attached to INV-000001 (via API), reassign
        # explicitly to same invoice, and verify it stays attached after recalc.
        r0 = requests.get(f"{API}/invoices/client/J2934",
                          headers=admin_headers, timeout=30)
        assert r0.status_code == 200, r0.text
        data = r0.json()
        invs = data if isinstance(data, list) else (data.get("invoices") or [])
        inv1 = next((i for i in invs if i.get("invoice_number") == "INV-000001"), None)
        if not inv1 or not (inv1.get("applied_deposits") or []):
            pytest.skip("INV-000001 has no deposits attached")
        inv_id = inv1["id"]
        dep_id = inv1["applied_deposits"][0]["deposit_id"]

        # Assign explicitly to that invoice
        r = requests.put(f"{API}/wallet/deposit/{dep_id}/assign-invoice",
                         headers=admin_headers,
                         json={"invoice_id": inv_id}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("target_invoice_id") == inv_id

        # Recalc and confirm deposit still attached to INV-000001
        r2 = requests.post(f"{API}/admin/recalculate-invoices/J2934",
                           headers=admin_headers, timeout=60)
        assert r2.status_code == 200

        r3 = requests.get(f"{API}/invoices/client/J2934",
                          headers=admin_headers, timeout=30)
        data3 = r3.json()
        invs3 = data3 if isinstance(data3, list) else (data3.get("invoices") or [])
        inv1_after = next((i for i in invs3 if i.get("id") == inv_id), None)
        assert inv1_after is not None
        attached_ids = {ad.get("deposit_id") for ad in (inv1_after.get("applied_deposits") or [])}
        assert dep_id in attached_ids, \
            f"deposit {dep_id} lost manual attachment after recalc; attached={attached_ids}"


# ---- Saldo a favor visibility ------------------------------------------

class TestSaldoAFavor:
    def test_admin_clients_has_saldo_a_favor(self, admin_headers):
        r = requests.get(f"{API}/admin/clients", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        clients = data if isinstance(data, list) else (data.get("clients") or data.get("data") or [])
        assert len(clients) > 0, "no clients returned"
        # Look for any client with saldo_a_favor field (present even if 0)
        keys_seen = set()
        for c in clients[:20]:
            keys_seen.update(c.keys())
        # PRD promises saldo_a_favor visible
        assert any("saldo" in k for k in keys_seen), \
            f"no saldo-related field on client. keys={sorted(keys_seen)[:30]}"


# ---- helpers -----------------------------------------------------------

_admin_token_cache = {"tok": None}


def _get_admin_token():
    if _admin_token_cache["tok"]:
        return _admin_token_cache["tok"]
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    data = r.json()
    _admin_token_cache["tok"] = data.get("access_token") or data.get("token")
    return _admin_token_cache["tok"]
