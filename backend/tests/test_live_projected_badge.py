"""Tests for projected 'Total al Facturar' fields exposed to AdminLive badge.

Covers: GET /api/admin/clients/{customer_id}/info -> projected_total_a_pagar,
projected_saldo_a_favor, floating_recharge, pending_to_invoice, invoiced_debt.
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
REQUIRED = [
    "projected_total_a_pagar",
    "projected_saldo_a_favor",
    "floating_recharge",
    "pending_to_invoice",
    "invoiced_debt",
    "invoiced_credit",
    "pending_purchases_count",
]


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        pytest.fail(f"No token: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _info(admin_client, cid):
    r = admin_client.get(f"{BASE_URL}/api/admin/clients/{cid}/info", timeout=60)
    if r.status_code == 404:
        pytest.skip(f"{cid} not seeded")
    assert r.status_code == 200, f"{cid}: {r.status_code} {r.text[:300]}"
    return r.json()


class TestProjectedFields:
    @pytest.mark.parametrize("cid", ["C5557", "T0506", "S2584"])
    def test_fields_present_and_numeric(self, admin_client, cid):
        d = _info(admin_client, cid)
        assert "_id" not in d
        for k in REQUIRED:
            assert k in d, f"{cid} missing {k}"
            assert isinstance(d[k], (int, float)) and not isinstance(d[k], bool), f"{cid}.{k}={d[k]!r}"
        # projected debt and projected credit are mutually exclusive
        assert not (d["projected_total_a_pagar"] > 0.01 and d["projected_saldo_a_favor"] > 0.01), \
            f"{cid}: both projected values > 0 -> {d['projected_total_a_pagar']}/{d['projected_saldo_a_favor']}"
        assert d["projected_total_a_pagar"] >= 0
        assert d["projected_saldo_a_favor"] >= 0

    def test_c5557_has_projected_debt(self, admin_client):
        d = _info(admin_client, "C5557")
        assert d["projected_total_a_pagar"] > 0, d
        assert d["projected_saldo_a_favor"] == pytest.approx(0, abs=0.011)

    def test_t0506_has_projected_credit(self, admin_client):
        d = _info(admin_client, "T0506")
        assert d["projected_saldo_a_favor"] > 0, d
        assert d["projected_total_a_pagar"] == pytest.approx(0, abs=0.011)

    def test_s2584_up_to_date(self, admin_client):
        d = _info(admin_client, "S2584")
        assert d["projected_total_a_pagar"] == pytest.approx(0, abs=0.011), d
        assert d["projected_saldo_a_favor"] == pytest.approx(0, abs=0.011), d

    @pytest.mark.parametrize("cid", ["C5557", "T0506", "S2584"])
    def test_projection_formula(self, admin_client, cid):
        """projected = (pending_to_invoice + invoiced_debt) - (floating + invoiced_credit)"""
        d = _info(admin_client, cid)
        net = round(
            (d["pending_to_invoice"] + d["invoiced_debt"])
            - (d["floating_recharge"] + d["invoiced_credit"]),
            2,
        )
        if net > 0:
            assert d["projected_total_a_pagar"] == pytest.approx(net, abs=0.02), d
        else:
            assert d["projected_saldo_a_favor"] == pytest.approx(-net, abs=0.02), d


class TestProjectedAcrossAllClients:
    def test_no_500_and_consistent_for_sample(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/clients", timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        clients = r.json()
        assert isinstance(clients, list) and clients
        sample = clients[:12]
        for c in sample:
            cid = c["customer_id"]
            rr = admin_client.get(f"{BASE_URL}/api/admin/clients/{cid}/info", timeout=60)
            assert rr.status_code == 200, f"{cid}: {rr.status_code} {rr.text[:200]}"
            d = rr.json()
            for k in ("projected_total_a_pagar", "projected_saldo_a_favor"):
                assert k in d, f"{cid} missing {k}"

    def test_list_also_exposes_projected(self, admin_client):
        """AdminClients regression: list should expose projected total too."""
        r = admin_client.get(f"{BASE_URL}/api/admin/clients", timeout=180)
        assert r.status_code == 200
        clients = r.json()
        missing = [c["customer_id"] for c in clients[:20] if "projected_total_a_pagar" not in c]
        assert not missing, f"clients list missing projected_total_a_pagar for {missing[:5]}"
