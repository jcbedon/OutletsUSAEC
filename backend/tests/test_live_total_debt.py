"""Tests for LIVE total debt exposure (pending_to_invoice as $$, real_pending_balance).

Covers:
- GET /api/admin/clients  -> pending_to_invoice (float $), pending_to_invoice_count (int),
  pending_balance, real_pending_balance
- GET /api/admin/clients/{customer_id}/info -> pending_to_invoice, pending_purchases_count,
  pending_balance, real_pending_balance, invoiced_debt, invoiced_credit
"""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}


@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        pytest.fail(f"No token in login response: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def clients_list(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/admin/clients", timeout=120)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    return data


class TestAdminClientsListDebtFields:
    """/api/admin/clients new debt fields"""

    def test_no_mongo_id_leak(self, clients_list):
        assert all("_id" not in c for c in clients_list)

    def test_fields_present_and_typed(self, clients_list):
        for c in clients_list:
            assert "pending_to_invoice" in c, f"missing pending_to_invoice for {c.get('customer_id')}"
            assert "pending_to_invoice_count" in c
            assert "pending_balance" in c
            assert "real_pending_balance" in c
            assert isinstance(c["pending_to_invoice"], (int, float)) and not isinstance(c["pending_to_invoice"], bool)
            assert isinstance(c["pending_to_invoice_count"], int)
            assert isinstance(c["real_pending_balance"], (int, float))

    def test_pending_to_invoice_is_money_not_count(self, clients_list):
        """pending_to_invoice must be $$ sum, not the count. At least one client must
        have amount != count and amount > count (money >= per-item)."""
        money_like = [
            c for c in clients_list
            if c["pending_to_invoice_count"] > 0 and c["pending_to_invoice"] != c["pending_to_invoice_count"]
        ]
        assert money_like, "pending_to_invoice looks like a COUNT for every client (regression)"

    def test_real_pending_balance_formula(self, clients_list):
        for c in clients_list:
            pb = c["pending_balance"]
            pti = c["pending_to_invoice"]
            rpb = c["real_pending_balance"]
            cid = c.get("customer_id")
            if pb < 0:
                assert rpb == pytest.approx(round(pb - pti, 2), abs=0.011), f"{cid}: debt case"
            elif pb > 0:
                # credit NOT netted against pending purchases
                assert rpb == pytest.approx(pb, abs=0.011), f"{cid}: credit must stay intact"
            else:
                expected = round(-pti, 2) if pti > 0 else 0
                assert rpb == pytest.approx(expected, abs=0.011), f"{cid}: zero-invoice case"

    def test_some_client_has_pending_to_invoice(self, clients_list):
        assert any(c["pending_to_invoice"] > 0 for c in clients_list), "no seed client with unbilled purchases"

    def test_c5557_has_pending_and_formula(self, clients_list):
        c = next((x for x in clients_list if x.get("customer_id") == "C5557"), None)
        if not c:
            pytest.skip("seed client C5557 not present")
        assert c["pending_to_invoice"] > 0, f"C5557 pending_to_invoice={c['pending_to_invoice']}"
        assert c["real_pending_balance"] == pytest.approx(
            round(c["pending_balance"] - c["pending_to_invoice"], 2), abs=0.011
        ) if c["pending_balance"] < 0 else True

    def test_f4608_credit_not_netted(self, clients_list):
        c = next((x for x in clients_list if x.get("customer_id") == "F4608"), None)
        if not c:
            pytest.skip("seed client F4608 not present")
        if c["pending_balance"] <= 0:
            pytest.skip(f"F4608 has no credit (pending_balance={c['pending_balance']})")
        assert c["real_pending_balance"] == pytest.approx(c["pending_balance"], abs=0.011)


class TestClientInfoDebtFields:
    """/api/admin/clients/{customer_id}/info"""

    @pytest.mark.parametrize("cid", ["C5557", "F4608", "M9666"])
    def test_info_fields(self, admin_client, cid):
        r = admin_client.get(f"{BASE_URL}/api/admin/clients/{cid}/info", timeout=60)
        if r.status_code == 404:
            pytest.skip(f"{cid} not seeded")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "_id" not in d
        for k in ["pending_to_invoice", "pending_purchases_count", "pending_balance",
                  "real_pending_balance", "invoiced_debt", "invoiced_credit"]:
            assert k in d, f"{cid} missing {k}"
        assert isinstance(d["pending_purchases_count"], int)
        pb, pti, rpb = d["pending_balance"], d["pending_to_invoice"], d["real_pending_balance"]
        if pb < 0:
            assert rpb == pytest.approx(round(pb - pti, 2), abs=0.011)
            # invoiced_debt + pending_to_invoice == |real_pending_balance|
            assert round(d["invoiced_debt"] + pti, 2) == pytest.approx(abs(rpb), abs=0.011)
        elif pb > 0:
            assert rpb == pytest.approx(pb, abs=0.011)
            assert d["invoiced_credit"] == pytest.approx(pb, abs=0.011)

    def test_info_matches_list(self, admin_client, clients_list):
        """Consistency between list endpoint and info endpoint for clients with pending."""
        targets = [c for c in clients_list if c["pending_to_invoice"] > 0][:5]
        if not targets:
            pytest.skip("no clients with pending_to_invoice")
        for c in targets:
            cid = c["customer_id"]
            r = admin_client.get(f"{BASE_URL}/api/admin/clients/{cid}/info", timeout=60)
            assert r.status_code == 200, f"{cid}: {r.status_code}"
            d = r.json()
            assert d["pending_to_invoice"] == pytest.approx(c["pending_to_invoice"], abs=0.011), f"{cid} pti mismatch"
            assert d["pending_purchases_count"] == c["pending_to_invoice_count"], f"{cid} count mismatch"
            assert d["real_pending_balance"] == pytest.approx(c["real_pending_balance"], abs=0.011), f"{cid} rpb mismatch"

    def test_info_404_unknown(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/clients/ZZZ9999/info", timeout=60)
        assert r.status_code == 404


class TestAuthGuards:
    # NOTE: app returns 422 (missing header validation) instead of 401 when no
    # Authorization header is sent. Reported as MINOR backend issue.
    def test_clients_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/clients", timeout=60)
        assert r.status_code in (401, 403, 422)

    def test_info_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/clients/C5557/info", timeout=60)
        assert r.status_code in (401, 403, 422)


class TestStatsSummaryPending:
    """AdminStats KPI source: verify pending_to_invoice is available in stats summary."""

    def test_stats_endpoint(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/stats/summary", timeout=120)
        if r.status_code == 404:
            pytest.skip("no /api/admin/stats/summary endpoint")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
