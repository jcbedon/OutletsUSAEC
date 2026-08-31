"""Backend tests for /api/admin/reports/clients-debts (source for AdminStats Deudas tab)."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=60)
    assert r.status_code == 200, r.text[:300]
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def debts(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/admin/reports/clients-debts", timeout=120)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    return r.json()


class TestClientsDebtsReport:
    def test_shape(self, debts):
        assert "clients" in debts and "summary" in debts
        assert isinstance(debts["clients"], list) and debts["clients"]

    def test_client_rows_have_pending_to_invoice(self, debts):
        for c in debts["clients"]:
            assert "pending_to_invoice" in c, f"missing pending_to_invoice for {c.get('customer_id')}"
            assert "pending_balance" in c
            assert "debt_amount" in c
            assert "_id" not in c

    def test_pending_to_invoice_is_money(self, debts):
        rows = [c for c in debts["clients"] if (c.get("pending_to_invoice") or 0) > 0]
        assert rows, "no client with pending_to_invoice in debts report"
        # money values are rarely integers equal to a small count
        assert any(abs(c["pending_to_invoice"] - round(c["pending_to_invoice"])) > 0 for c in rows), \
            "pending_to_invoice looks like an integer count"

    def test_total_debt_combined_math(self, debts):
        """KPI 'Deuda Total' = sum(debt_amount) + sum(pending_to_invoice)."""
        clients = debts["clients"]
        invoiced = sum(c.get("debt_amount") or 0 for c in clients if (c.get("pending_balance") or 0) < 0)
        pending = sum(c.get("pending_to_invoice") or 0 for c in clients if (c.get("pending_to_invoice") or 0) > 0.01)
        total = invoiced + pending
        assert total > 0
        print(f"invoiced={invoiced:.2f} pending={pending:.2f} total={total:.2f}")

    def test_summary_counts_consistent(self, debts):
        s = debts["summary"]
        clients = debts["clients"]
        with_debt = [c for c in clients if (c.get("pending_balance") or 0) < 0]
        if "clients_with_debt" in s:
            assert s["clients_with_debt"] == len(with_debt)
        if "clients_with_pending_to_invoice" in s:
            assert s["clients_with_pending_to_invoice"] == len(
                [c for c in clients if (c.get("pending_to_invoice") or 0) > 0.01]
            )

    def test_debt_amount_matches_pending_balance(self, debts):
        for c in debts["clients"]:
            pb = c.get("pending_balance") or 0
            if pb < 0:
                assert c.get("debt_amount") == pytest.approx(abs(pb), abs=0.011), c.get("customer_id")
