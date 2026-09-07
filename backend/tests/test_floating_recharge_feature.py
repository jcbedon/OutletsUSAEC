"""
Tests for the "Abono Disponible / Floating Recharge" feature.

Feature summary (Spanish UI):
 - When admin approves a deposit, they may (a) target a specific invoice, (b) mark it as
   "Abono para siguientes compras" (floating credit), or (c) send no body (backwards
   compat -> date-based auto-assign).
 - GET /api/wallet/{user_id} exposes new field `abono_disponible` (sum of approved
   floating credits still un-consumed).
 - GET /api/admin/clients exposes `abono_disponible` per client.
 - Creating a new invoice auto-consumes floating credits for that client.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@outletsusaec.com"
ADMIN_PASS = "123456"
CLIENT_ID = "T1964"          # historial client per problem statement
CLIENT_PASS = "123"


# ────────────────────────────── fixtures ──────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_user():
    r = requests.post(f"{API}/auth/login",
                      json={"identifier": CLIENT_ID, "password": CLIENT_PASS})
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"],
            "user_id": data.get("user_id") or (data.get("user") or {}).get("id"),
            "customer_id": data.get("customer_id", CLIENT_ID)}


@pytest.fixture(scope="module")
def client_headers(client_user):
    return {"Authorization": f"Bearer {client_user['token']}",
            "Content-Type": "application/json"}


# ─────────────────────────── helper functions ─────────────────────────
def create_pending_deposit(headers, user_id, amount, ref):
    """Client creates a deposit request, admin sets its amount → pending w/ amount."""
    # request as client
    r = requests.post(f"{API}/wallet/deposit-request",
                      headers=headers,
                      json={"user_id": user_id, "reference_number": ref,
                            "amount": amount})
    assert r.status_code in (200, 201), f"deposit-request failed: {r.status_code} {r.text}"
    return r.json()


def find_pending_tx_for_user(admin_headers, user_id):
    r = requests.get(f"{API}/wallet/pending-deposits", headers=admin_headers)
    assert r.status_code == 200, r.text
    for tx in r.json():
        if tx.get("user_id") == user_id and tx.get("status") == "pending":
            return tx
    return None


# ─────────────────────────── ready snapshot ───────────────────────────
def test_admin_clients_returns_abono_disponible(admin_headers):
    r = requests.get(f"{API}/admin/clients", headers=admin_headers)
    assert r.status_code == 200, r.text
    clients = r.json()
    assert isinstance(clients, list) and len(clients) > 0
    # at least one client entry must contain the key
    assert "abono_disponible" in clients[0], \
        "GET /api/admin/clients must expose abono_disponible field"


def test_wallet_returns_abono_disponible(admin_headers, client_user):
    r = requests.get(f"{API}/wallet/{client_user['user_id']}", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "abono_disponible" in body, "wallet response must include abono_disponible"
    assert isinstance(body["abono_disponible"], (int, float))


# ─────────────────── validation on approve-deposit body ───────────────
def _create_and_get_pending(admin_headers, client_headers, client_user, amount, tag):
    ref = f"TEST-{tag}-{uuid.uuid4().hex[:8]}"
    create_pending_deposit(client_headers, client_user["user_id"], amount, ref)
    # admin must set the amount before it can be approved. deposit-request already sets amount.
    tx = find_pending_tx_for_user(admin_headers, client_user["user_id"])
    assert tx is not None, "pending tx not found after creation"
    # ensure amount is set (route requires >0 to approve)
    if not tx.get("amount"):
        r = requests.patch(
            f"{API}/wallet/pending-deposit/{tx['id']}/amount",
            headers=admin_headers, json={"amount": amount})
        assert r.status_code == 200, r.text
        tx["amount"] = amount
    return tx


def test_approve_rejects_both_target_and_floating(admin_headers, client_headers, client_user):
    tx = _create_and_get_pending(admin_headers, client_headers, client_user, 1.0, "both")
    # need an invoice id — grab any active invoice of the client
    inv_r = requests.get(f"{API}/invoices/client/{client_user['customer_id']}",
                         headers=admin_headers)
    assert inv_r.status_code == 200, inv_r.text
    invs = inv_r.json()
    inv_id = next((i["id"] for i in invs if not i.get("is_annulled")), None)
    assert inv_id, "no live invoice on T1964"
    r = requests.post(f"{API}/wallet/approve-deposit/{tx['id']}",
                      headers=admin_headers,
                      json={"target_invoice_id": inv_id, "is_floating_credit": True})
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    assert "abono flotante" in r.text.lower() or "no puedes" in r.text.lower()
    # cleanup - reject so the pending is closed
    requests.post(f"{API}/wallet/reject-deposit/{tx['id']}", headers=admin_headers,
                  json={"reason": "test cleanup"})


def test_approve_rejects_missing_invoice(admin_headers, client_headers, client_user):
    tx = _create_and_get_pending(admin_headers, client_headers, client_user, 1.0, "missing")
    r = requests.post(f"{API}/wallet/approve-deposit/{tx['id']}",
                      headers=admin_headers,
                      json={"target_invoice_id": "does-not-exist-xyz"})
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
    assert "no encontrada" in r.text.lower() or "anulada" in r.text.lower()
    requests.post(f"{API}/wallet/reject-deposit/{tx['id']}", headers=admin_headers,
                  json={"reason": "test cleanup"})


# ────────────── functional: floating credit end-to-end path ──────────
def test_approve_as_floating_credit_updates_wallet_and_abono(admin_headers, client_headers, client_user):
    amount = 3.33
    tx = _create_and_get_pending(admin_headers, client_headers, client_user, amount, "float")

    # snapshot before
    w_before = requests.get(f"{API}/wallet/{client_user['user_id']}",
                            headers=admin_headers).json()
    abono_before = w_before.get("abono_disponible", 0) or 0
    saldo_favor_before = w_before.get("saldo_a_favor", 0) or 0

    r = requests.post(f"{API}/wallet/approve-deposit/{tx['id']}",
                      headers=admin_headers,
                      json={"is_floating_credit": True})
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"

    # wait a beat for any async
    time.sleep(0.5)
    w_after = requests.get(f"{API}/wallet/{client_user['user_id']}",
                           headers=admin_headers).json()
    assert round(w_after["abono_disponible"] - abono_before, 2) == amount, \
        f"abono_disponible did not increase by {amount}: {abono_before} -> {w_after['abono_disponible']}"

    # saldo_a_favor of the last invoice should NOT have changed
    assert round(w_after.get("saldo_a_favor", 0) - saldo_favor_before, 2) == 0, \
        "saldo_a_favor changed after floating approve — floating credit must NOT apply to invoices"

    # verify tx flag persisted
    tx_r = requests.get(f"{API}/wallet/transactions/{client_user['user_id']}",
                        headers=admin_headers)
    if tx_r.status_code == 200:
        entries = tx_r.json() if isinstance(tx_r.json(), list) else tx_r.json().get("transactions", [])
        matched = next((t for t in entries if t.get("id") == tx["id"]), None)
        if matched is not None:
            assert matched.get("is_floating_credit") is True


# ────────────── backwards-compat: approve with NO body ───────────────
def test_approve_with_no_body_backwards_compat(admin_headers, client_headers, client_user):
    amount = 1.11
    tx = _create_and_get_pending(admin_headers, client_headers, client_user, amount, "nobody")
    # POST without body — must still succeed
    r = requests.post(f"{API}/wallet/approve-deposit/{tx['id']}", headers=admin_headers)
    assert r.status_code == 200, f"no-body approve failed: {r.status_code} {r.text}"


# ────────────── approve with target_invoice_id ───────────────────────
def test_approve_with_target_invoice(admin_headers, client_headers, client_user):
    amount = 2.22
    tx = _create_and_get_pending(admin_headers, client_headers, client_user, amount, "target")
    inv_r = requests.get(f"{API}/invoices/client/{client_user['customer_id']}",
                         headers=admin_headers)
    assert inv_r.status_code == 200
    invs = [i for i in inv_r.json() if not i.get("is_annulled")]
    # pick oldest live invoice (opposite of date-based default which picks latest)
    invs.sort(key=lambda x: x.get("created_at", ""))
    target = invs[0]
    r = requests.post(f"{API}/wallet/approve-deposit/{tx['id']}",
                      headers=admin_headers,
                      json={"target_invoice_id": target["id"]})
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"

    # Verify the deposit is applied to that invoice (fetch invoice and check applied_deposits)
    time.sleep(0.5)
    inv_after = requests.get(f"{API}/invoices/{target['id']}",
                             headers=admin_headers).json()
    applied = inv_after.get("applied_deposits", []) or []
    ids = {a.get("deposit_id") for a in applied}
    assert tx["id"] in ids, \
        f"deposit {tx['id']} was NOT applied to target invoice {target['id']}. applied={applied}"
