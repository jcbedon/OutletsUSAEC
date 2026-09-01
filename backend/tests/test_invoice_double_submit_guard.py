"""
Iteration 19 — Production bug KIWI: already-invoiced purchases resurfacing as pending.

Covers:
  • POST /api/invoices guard: 409 when any purchase already has invoice_id
  • POST /api/invoices happy path (all pending) still works
  • Regression: 400 "Algunas compras no fueron encontradas" for unknown ids
  • Regression: PUT /api/invoices/{id}/add-items guard for cross-invoice purchases
  • GET /api/admin/clients/{customer_id}/purchase-integrity (healthy, corrupted,
    unknown client, 403 for client role)
"""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

_be = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _be.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _be.get("DB_NAME")


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m_id = re.search(r"(?im)^-\s*identifier:\s*(\S+)", content)
    m_pw = re.search(r"(?im)^-\s*password:\s*(\S+)", content)
    if not m_id or not m_pw:
        pytest.skip("No admin credentials in /app/memory/test_credentials.md")
    return m_id.group(1), m_pw.group(1)


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin():
    identifier, password = _creds()
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=90)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token, "login response missing token"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def live_id(admin):
    r = admin.post(f"{API}/lives", json={"title": "TEST_LIVE_KIWI_GUARD", "store": "TEST_STORE"}, timeout=60)
    assert r.status_code in (200, 201), r.text[:300]
    return r.json()["live_id"]


@pytest.fixture(scope="module")
def test_client(admin, mongo):
    """Create isolated TESTKIWI client; cleanup everything at teardown."""
    suffix = uuid.uuid4().hex[:6].upper()
    name = f"TESTKIWI {suffix}"
    payload = {
        "name": name,
        "country": "Ecuador",
        "whatsapp": f"+5939{uuid.uuid4().int % 10**8:08d}",
        "email": f"testkiwi_{suffix.lower()}@example.test",
        "password": "123456",
        "commission_fee": 2.0,
        "initial_balance": 0.0,
    }
    r = admin.post(f"{API}/admin/clients/create", json=payload, timeout=90)
    assert r.status_code in (200, 201), f"client create failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    cid = body["customer_id"]
    uid = body["user_id"]
    yield {"customer_id": cid, "user_id": uid, "email": payload["email"]}
    # teardown
    mongo.purchases.delete_many({"customer_id": cid})
    mongo.invoices.delete_many({"customer_id": cid})
    mongo.wallet_transactions.delete_many({"customer_id": cid})
    mongo.wallets.delete_many({"customer_id": cid})
    mongo.shipments.delete_many({"customer_id": cid})
    mongo.users.delete_many({"id": uid})
    mongo.lives.delete_many({"title": "TEST_LIVE_KIWI_GUARD"})


def _mk_purchase(admin, cid, live_id, name, price=25.0):
    r = admin.post(f"{API}/purchases", json={
        "customer_id": cid, "item_name": name, "store": "TEST_STORE",
        "price": price, "live_id": live_id, "tax_rate": 0.0825,
        "apply_tax": True, "apply_commission": True, "commission_amount": 2.0,
    }, timeout=90)
    assert r.status_code in (200, 201), f"purchase create failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    pid = data.get("purchase_id") or data.get("id") or (data.get("purchase") or {}).get("id")
    assert pid, f"no purchase id in response: {data}"
    return pid


# ---------------------------------------------------------------- create_invoice
class TestCreateInvoiceDoubleSubmitGuard:

    def test_race_scenario_second_invoice_rejected_with_409(self, admin, test_client, live_id, mongo):
        cid = test_client["customer_id"]
        p1 = _mk_purchase(admin, cid, live_id, "TEST_ITEM_P1", 25.0)
        p2 = _mk_purchase(admin, cid, live_id, "TEST_ITEM_P2", 40.0)

        # (3) invoice A succeeds
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [p1, p2]}, timeout=120)
        assert r.status_code in (200, 201), f"first invoice failed: {r.status_code} {r.text[:400]}"
        inv_a = r.json()
        inv_a_id = inv_a.get("invoice_id") or inv_a.get("id")
        assert inv_a_id, f"no invoice id: {inv_a}"
        assert '"_id"' not in str(inv_a) and "'_id'" not in str(inv_a), "Mongo _id leaked in invoice response"

        # purchases now linked to A
        for pid in (p1, p2):
            doc = mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})
            assert doc["invoice_id"] == inv_a_id, f"{pid} not linked to invoice A"

        invoices_before = mongo.invoices.count_documents({"customer_id": cid})

        # (4) duplicate submit -> 409
        r2 = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [p1, p2]}, timeout=120)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text[:400]}"
        detail = r2.json().get("detail", "")
        assert "ya están facturadas" in detail, detail
        assert "Refresca la página" in detail, detail
        assert "2 compra(s)" in detail, detail

        # no new invoice created
        assert mongo.invoices.count_documents({"customer_id": cid}) == invoices_before

        # purchases still point to A
        for pid in (p1, p2):
            doc = mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})
            assert doc["invoice_id"] == inv_a_id, f"{pid} lost its invoice_id after rejected submit"

        # integrity still healthy
        ri = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90)
        assert ri.status_code == 200, ri.text[:300]
        assert ri.json()["is_healthy"] is True, ri.json()

    def test_mixed_pending_and_invoiced_rejected(self, admin, test_client, live_id, mongo):
        """One already-invoiced + one pending -> 409, pending stays pending."""
        cid = test_client["customer_id"]
        p_new = _mk_purchase(admin, cid, live_id, "TEST_ITEM_P3", 15.0)
        p_old = mongo.purchases.find_one(
            {"customer_id": cid, "invoice_id": {"$ne": None}}, {"_id": 0, "id": 1, "invoice_id": 1}
        )
        assert p_old, "expected an already-invoiced purchase from previous test"

        r = admin.post(f"{API}/invoices",
                       json={"customer_id": cid, "purchase_ids": [p_new, p_old["id"]]}, timeout=120)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:400]}"
        assert "1 compra(s) ya están facturadas" in r.json().get("detail", "")

        assert mongo.purchases.find_one({"id": p_new}, {"_id": 0, "invoice_id": 1}).get("invoice_id") in (None, "")
        assert mongo.purchases.find_one({"id": p_old["id"]}, {"_id": 0, "invoice_id": 1})["invoice_id"] == p_old["invoice_id"]

    def test_all_pending_creates_invoice(self, admin, test_client, live_id, mongo):
        cid = test_client["customer_id"]
        pending = [p["id"] for p in mongo.purchases.find(
            {"customer_id": cid, "$or": [{"invoice_id": None}, {"invoice_id": {"$exists": False}}]}, {"_id": 0, "id": 1})]
        assert pending, "no pending purchases to invoice"

        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": pending}, timeout=120)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        inv_id = body.get("invoice_id") or body.get("id")
        assert inv_id
        for pid in pending:
            assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] == inv_id

    def test_unknown_purchase_ids_return_400(self, admin, test_client):
        cid = test_client["customer_id"]
        r = admin.post(f"{API}/invoices",
                       json={"customer_id": cid, "purchase_ids": [str(uuid.uuid4())]}, timeout=90)
        assert r.status_code == 400, f"{r.status_code}: {r.text[:300]}"
        assert "no fueron encontradas" in r.json().get("detail", "")

    def test_missing_fields_return_400(self, admin, test_client):
        r = admin.post(f"{API}/invoices", json={"customer_id": test_client["customer_id"], "purchase_ids": []}, timeout=60)
        assert r.status_code == 400


# ------------------------------------------------------------- add-items guard
class TestAddItemsGuard:

    def test_add_items_rejects_purchase_from_another_invoice(self, admin, test_client, live_id, mongo):
        cid = test_client["customer_id"]
        invoices = list(mongo.invoices.find({"customer_id": cid}, {"_id": 0, "id": 1, "purchase_ids": 1}))
        assert len(invoices) >= 2, "need two invoices for cross-invoice test"
        inv_a, inv_b = invoices[0], invoices[1]
        pid_from_a = inv_a["purchase_ids"][0]

        r = admin.put(f"{API}/invoices/{inv_b['id']}/add-items",
                      json={"purchase_ids": [pid_from_a]}, timeout=90)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        assert "ya está en otra factura" in r.json().get("detail", "")

        # nothing mutated
        assert mongo.purchases.find_one({"id": pid_from_a}, {"_id": 0, "invoice_id": 1})["invoice_id"] == inv_a["id"]
        assert pid_from_a not in mongo.invoices.find_one({"id": inv_b["id"]}, {"_id": 0, "purchase_ids": 1})["purchase_ids"]

    def test_add_items_pending_purchase_succeeds(self, admin, test_client, live_id, mongo):
        cid = test_client["customer_id"]
        pid = _mk_purchase(admin, cid, live_id, "TEST_ITEM_ADD", 12.0)
        inv = mongo.invoices.find_one({"customer_id": cid}, {"_id": 0, "id": 1})
        r = admin.put(f"{API}/invoices/{inv['id']}/add-items", json={"purchase_ids": [pid]}, timeout=120)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert pid in mongo.invoices.find_one({"id": inv["id"]}, {"_id": 0, "purchase_ids": 1})["purchase_ids"]


# ------------------------------------------------------- purchase-integrity API
class TestPurchaseIntegrityEndpoint:

    def test_healthy_client_shape(self, admin, test_client):
        cid = test_client["customer_id"]
        r = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for key in ("customer_id", "invoice_count", "purchase_count", "orphans_in_invoice",
                    "cross_invoice_conflicts", "purchase_ids_not_found", "is_healthy"):
            assert key in d, f"missing key {key}"
        assert d["customer_id"] == cid
        assert isinstance(d["invoice_count"], int) and d["invoice_count"] >= 1
        assert isinstance(d["purchase_count"], int) and d["purchase_count"] >= 1
        assert d["orphans_in_invoice"] == []
        assert d["cross_invoice_conflicts"] == []
        assert d["purchase_ids_not_found"] == []
        assert d["is_healthy"] is True
        assert '"_id"' not in r.text, "Mongo _id leaked"

    def test_seed_client_C5557_reported(self, admin):
        r = admin.get(f"{API}/admin/clients/C5557/purchase-integrity", timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["customer_id"] == "C5557"
        print("C5557 integrity:", {k: (len(v) if isinstance(v, list) else v) for k, v in d.items()})

    def test_lowercase_customer_id_normalized(self, admin, test_client):
        cid = test_client["customer_id"]
        r = admin.get(f"{API}/admin/clients/{cid.lower()}/purchase-integrity", timeout=90)
        assert r.status_code == 200
        assert r.json()["customer_id"] == cid.upper()

    def test_corrupted_orphan_detected(self, admin, test_client, mongo):
        """Simulate the KIWI corruption: purchase.invoice_id=A but A.purchase_ids lacks it."""
        cid = test_client["customer_id"]
        inv = mongo.invoices.find_one({"customer_id": cid}, {"_id": 0, "id": 1, "purchase_ids": 1})
        victim = inv["purchase_ids"][0]
        original = list(inv["purchase_ids"])
        mongo.invoices.update_one({"id": inv["id"]}, {"$set": {"purchase_ids": [p for p in original if p != victim]}})
        try:
            r = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90)
            assert r.status_code == 200, r.text[:300]
            d = r.json()
            assert d["is_healthy"] is False
            orphans = [o for o in d["orphans_in_invoice"] if o["id"] == victim]
            assert orphans, f"victim not reported: {d['orphans_in_invoice']}"
            assert orphans[0]["reason"] == "not_in_invoice_purchase_ids"
        finally:
            mongo.invoices.update_one({"id": inv["id"]}, {"$set": {"purchase_ids": original}})
        # back to healthy
        r2 = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90)
        assert r2.json()["is_healthy"] is True

    def test_corrupted_missing_purchase_detected(self, admin, test_client, mongo):
        cid = test_client["customer_id"]
        inv = mongo.invoices.find_one({"customer_id": cid}, {"_id": 0, "id": 1, "purchase_ids": 1})
        original = list(inv["purchase_ids"])
        ghost = str(uuid.uuid4())
        mongo.invoices.update_one({"id": inv["id"]}, {"$set": {"purchase_ids": original + [ghost]}})
        try:
            d = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
            assert d["is_healthy"] is False
            assert any(x["missing_purchase_id"] == ghost for x in d["purchase_ids_not_found"]), d["purchase_ids_not_found"]
        finally:
            mongo.invoices.update_one({"id": inv["id"]}, {"$set": {"purchase_ids": original}})

    def test_cross_invoice_conflict_detected(self, admin, test_client, mongo):
        cid = test_client["customer_id"]
        invoices = list(mongo.invoices.find({"customer_id": cid}, {"_id": 0, "id": 1, "purchase_ids": 1}))
        assert len(invoices) >= 2
        inv_a, inv_b = invoices[0], invoices[1]
        pid = inv_a["purchase_ids"][0]
        original_b = list(inv_b["purchase_ids"])
        mongo.invoices.update_one({"id": inv_b["id"]}, {"$set": {"purchase_ids": original_b + [pid]}})
        try:
            d = admin.get(f"{API}/admin/clients/{cid}/purchase-integrity", timeout=90).json()
            assert d["is_healthy"] is False
            assert any(c["purchase_id"] == pid and c["also_in_invoice_id"] == inv_b["id"]
                       for c in d["cross_invoice_conflicts"]), d["cross_invoice_conflicts"]
        finally:
            mongo.invoices.update_one({"id": inv_b["id"]}, {"$set": {"purchase_ids": original_b}})

    def test_unknown_client_returns_empty_healthy(self, admin):
        r = admin.get(f"{API}/admin/clients/NOSUCHCLIENT999/purchase-integrity", timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["invoice_count"] == 0
        assert d["purchase_count"] == 0
        assert d["is_healthy"] is True

    def test_client_role_forbidden(self, test_client):
        s = requests.Session()
        r = s.post(f"{API}/auth/login",
                   json={"identifier": test_client["customer_id"], "password": "123456"}, timeout=90)
        assert r.status_code == 200, f"client login failed {r.status_code}: {r.text[:300]}"
        token = r.json()["token"]
        r2 = s.get(f"{API}/admin/clients/{test_client['customer_id']}/purchase-integrity",
                   headers={"Authorization": f"Bearer {token}"}, timeout=90)
        assert r2.status_code == 403, f"expected 403, got {r2.status_code}: {r2.text[:300]}"

    def test_no_auth_rejected_probe(self):
        r = requests.get(f"{API}/admin/clients/C5557/purchase-integrity", timeout=90)
        # NOTE: FastAPI returns 422 when the Authorization header is entirely absent
        assert r.status_code in (401, 403, 422), r.status_code


# ------------------------------------ interaction of new guard with annul/delete
class TestGuardInteractions:

    def test_annulled_invoice_purchases_can_be_reinvoiced(self, admin, test_client, live_id, mongo):
        """Annul frees invoice_id, so the new 409 guard must not block re-invoicing."""
        cid = test_client["customer_id"]
        pid = _mk_purchase(admin, cid, live_id, "TEST_ITEM_ANNUL", 20.0)
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=120)
        assert r.status_code in (200, 201), r.text[:300]
        inv_id = r.json()["invoice_id"]

        _, password = _creds()
        ra = admin.put(f"{API}/invoices/{inv_id}/annul", json={"password": password}, timeout=120)
        assert ra.status_code == 200, f"annul failed {ra.status_code}: {ra.text[:300]}"
        assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] is None

        r2 = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=120)
        assert r2.status_code in (200, 201), f"re-invoice after annul blocked: {r2.status_code} {r2.text[:300]}"
        assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1})["invoice_id"] == r2.json()["invoice_id"]

    def test_soft_deleted_purchase_rejected_with_409(self, admin, test_client, live_id, mongo):
        """New guard (iteration 20): create_invoice must reject is_deleted purchases with 409."""
        cid = test_client["customer_id"]
        pid = _mk_purchase(admin, cid, live_id, "TEST_ITEM_DELETED", 9.0)
        mongo.purchases.update_one({"id": pid}, {"$set": {"is_deleted": True}})
        invoices_before = mongo.invoices.count_documents({"customer_id": cid})
        r = admin.post(f"{API}/invoices", json={"customer_id": cid, "purchase_ids": [pid]}, timeout=120)
        print("create_invoice with soft-deleted purchase ->", r.status_code, r.text[:200])
        assert r.status_code == 409, (
            f"soft-deleted purchase not rejected with 409 (status {r.status_code}): {r.text[:300]}"
        )
        assert "están eliminadas y no pueden facturarse" in r.json().get("detail", ""), r.json()
        assert mongo.invoices.count_documents({"customer_id": cid}) == invoices_before
        assert mongo.purchases.find_one({"id": pid}, {"_id": 0, "invoice_id": 1}).get("invoice_id") in (None, "")
