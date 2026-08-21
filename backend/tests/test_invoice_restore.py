"""Tests for the annulled-invoice restore feature.

Covers:
  * GET  /api/invoices/annulled          (list annulled invoices, RBAC)
  * PUT  /api/invoices/{id}/restore      (restore, password, 400/404/409 paths)
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

# NOTE: /app/memory/test_credentials.md says admin123 but the seeded hash is for 123456.
ADMIN = {"identifier": "admin@outletsusaec.com", "password": "123456"}
CLIENT = {"identifier": "J2934", "password": "client123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {creds['identifier']}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def client_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CLIENT, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"client login unavailable: {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- GET /api/invoices/annulled ----------
class TestListAnnulled:
    def test_list_as_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=admin_h, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        assert isinstance(data, list)
        for inv in data:
            assert inv.get("is_annulled") is True, f"non-annulled invoice leaked: {inv.get('invoice_number')}"
            assert "_id" not in inv
            assert "invoice_number" in inv

    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/invoices/annulled", timeout=30)
        # app-wide behaviour: missing Authorization header -> 422 (pre-existing)
        assert r.status_code in (401, 403, 422), r.status_code

    def test_list_forbidden_for_client(self, client_token):
        h = {"Authorization": f"Bearer {client_token}"}
        r = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=h, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


# ---------- PUT /api/invoices/{id}/restore ----------
class TestRestore:
    def test_restore_unknown_id_404(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/invoices/does-not-exist-123/restore",
                         json={"password": ADMIN["password"]}, headers=admin_h, timeout=60)
        assert r.status_code == 404, f"{r.status_code}: {r.text[:200]}"

    def test_restore_wrong_password_401(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=admin_h, timeout=60)
        assert r.status_code == 200
        annulled = r.json()
        if not annulled:
            pytest.skip("no annulled invoice available")
        r = requests.put(f"{BASE_URL}/api/invoices/{annulled[0]['id']}/restore",
                         json={"password": "definitely-wrong"}, headers=admin_h, timeout=60)
        assert r.status_code == 401, f"{r.status_code}: {r.text[:200]}"

    def test_restore_forbidden_for_client(self, client_token, admin_h):
        r = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=admin_h, timeout=60)
        annulled = r.json() if r.status_code == 200 else []
        target = annulled[0]["id"] if annulled else "x"
        h = {"Authorization": f"Bearer {client_token}", "Content-Type": "application/json"}
        r = requests.put(f"{BASE_URL}/api/invoices/{target}/restore",
                         json={"password": "client123"}, headers=h, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_annul_then_restore_roundtrip(self, admin_h):
        """Annul a fresh approved invoice, restore it, verify flags + purchases."""
        s = requests.get(f"{BASE_URL}/api/invoices/search?status_filter=active&limit=200",
                         headers=admin_h, timeout=60)
        assert s.status_code == 200, f"search failed {s.status_code}: {s.text[:200]}"
        payload = s.json()
        invoices = payload.get("invoices", payload) if isinstance(payload, dict) else payload
        target = next((i for i in invoices
                       if i.get("status") == "approved" and not i.get("is_annulled")
                       and i.get("purchase_ids")), None)
        if not target:
            pytest.skip("no approved invoice with purchases available")
        inv_id = target["id"]

        a = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/annul",
                         json={"password": ADMIN["password"], "delete_shipment": False},
                         headers=admin_h, timeout=90)
        assert a.status_code == 200, f"annul failed {a.status_code}: {a.text[:300]}"

        # must now show up in annulled list
        lst = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=admin_h, timeout=60)
        assert lst.status_code == 200
        assert any(i["id"] == inv_id for i in lst.json()), "annulled invoice missing from list"

        # restore
        rs = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                          json={"password": ADMIN["password"]}, headers=admin_h, timeout=120)
        assert rs.status_code == 200, f"restore failed {rs.status_code}: {rs.text[:300]}"
        assert "restaurada" in rs.json().get("message", "").lower()

        # verify persisted state
        d = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=admin_h, timeout=60)
        assert d.status_code == 200, d.text[:200]
        detail = d.json()
        inv = detail.get("invoice", detail)
        assert inv.get("is_annulled") in (False, None), "invoice still annulled after restore"
        assert inv.get("restored_at"), "restored_at not set"
        assert inv.get("restored_by_name"), "restored_by_name not set"

        # no longer in annulled list
        lst2 = requests.get(f"{BASE_URL}/api/invoices/annulled", headers=admin_h, timeout=60)
        assert not any(i["id"] == inv_id for i in lst2.json()), "restored invoice still listed as annulled"

        # purchases re-attached
        items = detail.get("purchases") or detail.get("items") or []
        if items:
            for p in items:
                assert p.get("invoice_id") == inv_id, f"purchase {p.get('id')} not re-attached"

        # double restore -> 400
        again = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                             json={"password": ADMIN["password"]}, headers=admin_h, timeout=60)
        assert again.status_code == 400, f"expected 400 on non-annulled, got {again.status_code}"

    def test_restore_blocked_409_when_refactured(self, admin_h):
        """Annul an approved invoice, re-bill its purchases into a new invoice,
        then the restore must be rejected with 409 naming the blocking invoice."""
        s = requests.get(f"{BASE_URL}/api/invoices/search?status_filter=active&limit=200",
                         headers=admin_h, timeout=60)
        payload = s.json()
        invoices = payload.get("invoices", payload) if isinstance(payload, dict) else payload
        target = next((i for i in invoices
                       if i.get("status") == "approved" and not i.get("is_annulled")
                       and i.get("purchase_ids")), None)
        if not target:
            pytest.skip("no approved invoice available")
        inv_id, customer_id = target["id"], target["customer_id"]

        a = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/annul",
                         json={"password": ADMIN["password"]}, headers=admin_h, timeout=90)
        assert a.status_code == 200, a.text[:300]

        # create a new invoice for the same client re-billing the freed purchases
        pend = requests.get(f"{BASE_URL}/api/invoices/client/{customer_id}/pending-purchases",
                            headers=admin_h, timeout=60)
        assert pend.status_code == 200, pend.text[:200]
        pdata = pend.json()
        plist = pdata.get("purchases", pdata) if isinstance(pdata, dict) else pdata
        reuse = [p["id"] for p in plist if p["id"] in target["purchase_ids"]]
        new_inv_id = None
        try:
            if not reuse:
                pytest.skip("freed purchases not available as pending")
            c = requests.post(f"{BASE_URL}/api/invoices",
                              json={"customer_id": customer_id, "purchase_ids": reuse},
                              headers=admin_h, timeout=90)
            assert c.status_code in (200, 201), f"create invoice failed {c.status_code}: {c.text[:300]}"
            new_inv = c.json()
            new_inv_id = new_inv.get("id") or (new_inv.get("invoice") or {}).get("id")

            r = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                             json={"password": ADMIN["password"]}, headers=admin_h, timeout=90)
            assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
            assert "re-facturados" in r.json()["detail"]
        finally:
            # cleanup: annul the new invoice, restore the original
            if new_inv_id:
                requests.put(f"{BASE_URL}/api/invoices/{new_inv_id}/annul",
                             json={"password": ADMIN["password"]}, headers=admin_h, timeout=90)
            requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                         json={"password": ADMIN["password"]}, headers=admin_h, timeout=120)

    def test_restore_without_password_is_rejected(self, admin_h):
        """Feature spec: password is mandatory. Empty body must not silently restore."""
        s = requests.get(f"{BASE_URL}/api/invoices/search?status_filter=active&limit=200",
                         headers=admin_h, timeout=60)
        payload = s.json()
        invoices = payload.get("invoices", payload) if isinstance(payload, dict) else payload
        target = next((i for i in invoices
                       if i.get("status") == "approved" and not i.get("is_annulled")
                       and i.get("purchase_ids")), None)
        if not target:
            pytest.skip("no approved invoice available")
        inv_id = target["id"]
        a = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/annul",
                         json={"password": ADMIN["password"]}, headers=admin_h, timeout=90)
        assert a.status_code == 200, a.text[:200]
        res = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                           json={}, headers=admin_h, timeout=90)
        if res.status_code != 200:
            # leave state as found
            requests.put(f"{BASE_URL}/api/invoices/{inv_id}/restore",
                         json={"password": ADMIN["password"]}, headers=admin_h, timeout=120)
        assert res.status_code in (400, 401, 422), (
            f"SECURITY: restore succeeded with no password (got {res.status_code})")
