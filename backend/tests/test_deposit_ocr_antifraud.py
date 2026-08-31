"""Anti-fraud tests: OCR pre-insert validation on /wallet/deposit-request-with-proof
and the retroactive /admin/deposits/detect-duplicates endpoint.

Two layers:
  * HTTP layer (public preview URL) — auth, permissions, duplicate-by-typed-ref, admin grouping.
  * In-process ASGI layer — monkeypatches _scan_proof_image / object_store.upload_file so the
    OCR blocking logic can be exercised even though EMERGENT_LLM_KEY is absent in this env.
"""
import io
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = backend_env["MONGO_URL"]
DB_NAME = backend_env["DB_NAME"]

sys.path.insert(0, "/app/backend")

PNG_BYTES = None


def _png():
    """Small valid PNG (>100 bytes) used as fake proof image."""
    global PNG_BYTES
    if PNG_BYTES is None:
        try:
            from PIL import Image
            buf = io.BytesIO()
            Image.new("RGB", (200, 120), (250, 250, 250)).save(buf, format="PNG")
            PNG_BYTES = buf.getvalue()
        except Exception:
            PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 500
    return PNG_BYTES


# ---------------- shared fixtures ----------------
@pytest.fixture(scope="module")
def mongo():
    from pymongo import MongoClient
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {identifier}: {r.status_code} {r.text[:300]}")
    data = r.json()
    return data["token"], {"id": data.get("user_id"), "customer_id": data.get("customer_id"),
                           "name": data.get("name"), "role": data.get("role")}


@pytest.fixture(scope="module")
def admin():
    token, user = _login("admin@outletsusaec.com", "123456")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def client_user():
    token, user = _login("A2824", "123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def tenant_id(admin):
    import jwt
    payload = jwt.decode(admin["token"], options={"verify_signature": False})
    return payload["tenant_id"]


@pytest.fixture(scope="module")
def created_tx_ids(mongo):
    ids = []
    yield ids
    if ids:
        mongo.wallet_transactions.delete_many({"id": {"$in": ids}})


# ---------------- Module: startup indexes ----------------
class TestIndexes:
    def test_antifraud_compound_indexes_exist(self, mongo):
        keys = [tuple(ix["key"].items()) for ix in mongo.wallet_transactions.list_indexes()]
        assert (("tenant_id", 1), ("reference_number_lower", 1)) in keys, keys
        assert (("tenant_id", 1), ("ai_detected_reference_lower", 1)) in keys, keys


# ---------------- Module: HTTP deposit-request-with-proof ----------------
class TestDepositWithProofHttp:
    def test_client_missing_reference_rejected(self, client_user):
        r = requests.post(
            f"{API}/wallet/deposit-request-with-proof",
            headers=client_user["headers"],
            data={"user_id": client_user["user"]["id"], "amount": 10, "description": "TEST_no_ref"},
            files={"file": ("proof.png", _png(), "image/png")},
            timeout=120,
        )
        assert r.status_code == 400, r.text[:300]
        assert "comprobante" in r.json()["detail"].lower()

    def test_client_missing_file_rejected(self, client_user):
        r = requests.post(
            f"{API}/wallet/deposit-request-with-proof",
            headers=client_user["headers"],
            data={"user_id": client_user["user"]["id"], "amount": 10,
                  "reference_number": f"TEST-{uuid.uuid4().hex[:8]}", "description": "TEST_no_file"},
            timeout=120,
        )
        assert r.status_code == 400, r.text[:300]

    def test_duplicate_typed_reference_blocked_409(self, client_user, mongo, tenant_id, created_tx_ids):
        """Old check must still work: typed ref already used by a pending/approved tx -> 409."""
        ref = f"TEST-DUP-{uuid.uuid4().hex[:8]}"
        seed_id = str(uuid.uuid4())
        mongo.wallet_transactions.insert_one({
            "id": seed_id, "tenant_id": tenant_id, "user_id": client_user["user"]["id"],
            "customer_id": client_user["user"].get("customer_id"), "type": "deposit",
            "amount": 25.0, "status": "pending", "description": "TEST_seed_typed_dup",
            "reference_number": ref, "reference_number_lower": ref.lower(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        created_tx_ids.append(seed_id)
        r = requests.post(
            f"{API}/wallet/deposit-request-with-proof",
            headers=client_user["headers"],
            data={"user_id": client_user["user"]["id"], "amount": 25,
                  "reference_number": ref, "description": "TEST_typed_dup"},
            files={"file": ("proof.png", _png(), "image/png")},
            timeout=180,
        )
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
        assert "Ya existe una recarga" in r.json()["detail"]
        # nothing new persisted
        assert mongo.wallet_transactions.count_documents(
            {"tenant_id": tenant_id, "reference_number_lower": ref.lower()}) == 1

    def test_happy_path_creates_pending_tx(self, client_user, mongo, tenant_id, created_tx_ids):
        """Real upload through the public URL. With no EMERGENT_LLM_KEY, OCR must not block."""
        ref = f"TEST-OK-{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{API}/wallet/deposit-request-with-proof",
            headers=client_user["headers"],
            data={"user_id": client_user["user"]["id"], "amount": 30,
                  "reference_number": ref, "description": "TEST_happy"},
            files={"file": ("proof.png", _png(), "image/png")},
            timeout=180,
        )
        assert r.status_code == 200, f"deposit upload failed: {r.status_code} {r.text[:400]}"
        tx_id = r.json()["transaction_id"]
        created_tx_ids.append(tx_id)
        doc = mongo.wallet_transactions.find_one({"id": tx_id}, {"_id": 0})
        assert doc is not None, "transaction not persisted"
        assert doc["status"] == "pending"
        assert doc["reference_number"] == ref
        assert doc["reference_number_lower"] == ref.lower()
        assert doc.get("proof_url")


# ---------------- Module: in-process OCR pre-insert logic ----------------
@pytest.fixture(scope="module")
def asgi_ctx():
    import server
    return server


def _mk_scan(ref, amount=42.0, confidence="high"):
    async def _fake(proof_url, session_id="ocr"):
        return {
            "detected_reference_number": ref, "detected_amount": amount, "currency": "USD",
            "confidence": confidence, "detected_destination_account": "1234567",
            "detected_beneficiary_name": "TEST BENEF", "detected_deposit_date": None,
            "raw": '{"reference_number": "%s"}' % ref,
        }
    return _fake


async def _post_deposit(server, token, user_id, ref, amount=42.0):
    import httpx
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.post(
            "/api/wallet/deposit-request-with-proof",
            headers={"Authorization": f"Bearer {token}"},
            data={"user_id": user_id, "amount": str(amount), "reference_number": ref,
                  "description": "TEST_ocr"},
            files={"file": ("proof.png", _png(), "image/png")},
            timeout=60,
        )


class TestOcrPreInsert:
    @pytest.fixture(autouse=True)
    def _patch_storage(self, asgi_ctx, monkeypatch):
        """object_store needs EMERGENT_LLM_KEY; stub uploads so OCR logic can be tested."""
        monkeypatch.setattr(asgi_ctx.object_store, "upload_file",
                            lambda data, filename, folder: f"{folder}/TEST_{uuid.uuid4().hex}.png")

    @pytest.mark.asyncio(loop_scope="session")
    async def test_mismatch_blocks_400_and_no_db_record(self, asgi_ctx, monkeypatch, client_user, mongo, tenant_id):
        monkeypatch.setattr(asgi_ctx, "_scan_proof_image", _mk_scan("9988776655"))
        typed = f"TEST1234{uuid.uuid4().hex[:4]}"
        before = mongo.wallet_transactions.count_documents({"tenant_id": tenant_id})
        r = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], typed)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        assert r.json()["detail"] == ("El número de comprobante ingresado no coincide con el del recibo. "
                                      "Verifica los datos e intenta de nuevo.")
        assert mongo.wallet_transactions.count_documents({"tenant_id": tenant_id}) == before
        assert mongo.wallet_transactions.find_one({"reference_number_lower": typed.lower()}) is None

    @pytest.mark.asyncio(loop_scope="session")
    async def test_match_creates_tx_with_ai_scan_fields(self, asgi_ctx, monkeypatch, client_user, mongo, created_tx_ids):
        detected = f"77{uuid.uuid4().hex[:8]}"
        monkeypatch.setattr(asgi_ctx, "_scan_proof_image", _mk_scan(detected, amount=55.5))
        # typed with different case/spaces/dashes -> must still match after normalization
        typed = f" {detected[:4].upper()}-{detected[4:]} "
        r = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], typed)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        assert body["detected_amount"] == 55.5
        tx_id = body["transaction_id"]
        created_tx_ids.append(tx_id)
        doc = mongo.wallet_transactions.find_one({"id": tx_id}, {"_id": 0})
        assert doc["status"] == "pending"
        assert doc["ai_scan"]["detected_reference_number"] == detected
        assert doc["ai_scan"]["confidence"] == "high"
        assert doc["ai_scan"]["detected_amount"] == 55.5
        assert doc["ai_detected_reference_lower"] == detected.lower()

    @pytest.mark.asyncio(loop_scope="session")
    async def test_same_image_different_typed_number_blocked_409(self, asgi_ctx, monkeypatch, client_user, mongo, tenant_id, created_tx_ids):
        """THE reported fraud: same screenshot, different typed number."""
        detected = f"88{uuid.uuid4().hex[:8]}"
        monkeypatch.setattr(asgi_ctx, "_scan_proof_image", _mk_scan(detected))
        r1 = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], detected)
        assert r1.status_code == 200, r1.text[:300]
        created_tx_ids.append(r1.json()["transaction_id"])
        # attempt 2: same image (same OCR result), a made-up number -> mismatch 400
        r2 = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], "123456789000")
        assert r2.status_code == 400, f"fraud not blocked: {r2.status_code} {r2.text[:300]}"
        # attempt 3: same image, correct number but already used -> 409 image duplicate
        before = mongo.wallet_transactions.count_documents({"tenant_id": tenant_id})
        r3 = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"],
                                 detected[:4] + "-" + detected[4:])
        assert r3.status_code == 409, f"expected 409, got {r3.status_code}: {r3.text[:300]}"
        assert r3.json()["detail"] == "Este comprobante ya fue registrado anteriormente."
        assert mongo.wallet_transactions.count_documents({"tenant_id": tenant_id}) == before

    @pytest.mark.asyncio(loop_scope="session")
    async def test_ocr_failure_does_not_block(self, asgi_ctx, monkeypatch, client_user, mongo, created_tx_ids):
        async def _boom(proof_url, session_id="ocr"):
            raise RuntimeError("gemini down")
        monkeypatch.setattr(asgi_ctx, "_scan_proof_image", _boom)
        ref = f"TESTFAIL{uuid.uuid4().hex[:6]}"
        r = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], ref)
        assert r.status_code == 200, f"OCR failure must not block: {r.status_code} {r.text[:300]}"
        tx_id = r.json()["transaction_id"]
        created_tx_ids.append(tx_id)
        doc = mongo.wallet_transactions.find_one({"id": tx_id}, {"_id": 0})
        assert doc is not None and doc["status"] == "pending"
        assert "ai_scan" not in doc
        assert "ai_detected_reference_lower" not in doc

    @pytest.mark.asyncio(loop_scope="session")
    async def test_ocr_none_result_does_not_block(self, asgi_ctx, monkeypatch, client_user, mongo, created_tx_ids):
        async def _empty(proof_url, session_id="ocr"):
            return {}
        monkeypatch.setattr(asgi_ctx, "_scan_proof_image", _empty)
        ref = f"TESTNONE{uuid.uuid4().hex[:6]}"
        r = await _post_deposit(asgi_ctx, client_user["token"], client_user["user"]["id"], ref)
        assert r.status_code == 200, r.text[:300]
        created_tx_ids.append(r.json()["transaction_id"])


# ---------------- Module: admin retroactive duplicate detection ----------------
class TestDetectDuplicates:
    @pytest.fixture(scope="class")
    def seeded_dupes(self, mongo, tenant_id, client_user):
        ref_norm = f"testdup{uuid.uuid4().hex[:8]}"
        ids = []
        for i in range(2):
            tx_id = str(uuid.uuid4())
            ids.append(tx_id)
            mongo.wallet_transactions.insert_one({
                "id": tx_id, "tenant_id": tenant_id, "user_id": client_user["user"]["id"],
                "customer_id": client_user["user"].get("customer_id"), "type": "deposit",
                "amount": 40.0 + i, "status": "pending" if i else "approved",
                "description": "TEST_seed_img_dup",
                "reference_number": f"TEST-IMGDUP-{i}-{ref_norm[:5]}",
                "reference_number_lower": f"test-imgdup-{i}-{ref_norm[:5]}",
                "proof_url": "/api/uploads/proofs/TEST_fake.png",
                "ai_scan": {"detected_reference_number": ref_norm.upper(), "confidence": "high",
                            "detected_amount": 40.0 + i},
                "ai_detected_reference_lower": ref_norm,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        yield {"ref": ref_norm, "ids": ids}
        mongo.wallet_transactions.delete_many({"id": {"$in": ids}})

    def test_requires_auth(self):
        r = requests.post(f"{API}/admin/deposits/detect-duplicates", timeout=60)
        # NOTE: backend returns 422 (missing Authorization header) instead of 401 — minor inconsistency
        assert r.status_code in (401, 403, 422), r.status_code

    def test_client_role_forbidden(self, client_user):
        r = requests.post(f"{API}/admin/deposits/detect-duplicates",
                          headers=client_user["headers"], timeout=60)
        assert r.status_code == 403, r.text[:200]

    def test_employee_without_permission_forbidden(self, mongo):
        emp = mongo.employees.find_one({"email": "maria@outletsusaec.com"}, {"_id": 0})
        if not emp:
            pytest.skip("employee maria not seeded")
        token, _ = _login("maria@outletsusaec.com", "empleado123")
        r = requests.post(f"{API}/admin/deposits/detect-duplicates",
                          headers={"Authorization": f"Bearer {token}"}, timeout=60)
        if emp.get("permissions", {}).get("approve_recharges"):
            assert r.status_code == 200, f"employee WITH permission should pass: {r.text[:200]}"
        else:
            assert r.status_code == 403, r.text[:200]

    def test_admin_groups_image_duplicates(self, admin, seeded_dupes):
        r = requests.post(f"{API}/admin/deposits/detect-duplicates",
                          headers=admin["headers"], timeout=120)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        for key in ["scanned", "scan_errors", "duplicate_groups_count", "duplicate_groups"]:
            assert key in body, f"missing {key} in {list(body)}"
        assert body["scanned"] == 0
        assert isinstance(body["duplicate_groups"], list)
        assert body["duplicate_groups_count"] == len(body["duplicate_groups"])
        group = next((g for g in body["duplicate_groups"] if g.get("_id") == seeded_dupes["ref"]), None)
        assert group is not None, f"seeded duplicate group not returned: {[g.get('_id') for g in body['duplicate_groups']]}"
        assert group["count"] == 2
        assert len(group["transactions"]) == 2
        for t in group["transactions"]:
            assert t["id"] in seeded_dupes["ids"]
            assert t["status"] in ("pending", "approved")
            assert t["client_name"], "client_name not enriched"
            assert "client_whatsapp" in t
            assert t["ai_detected_reference_number"] == seeded_dupes["ref"].upper()
        # no mongo ObjectId leakage
        assert "_id" not in str(group["transactions"][0].get("id", ""))
        assert all(not isinstance(g.get("_id"), bytes) for g in body["duplicate_groups"])

    def test_scan_missing_true_returns_scan_counters(self, admin):
        r = requests.post(f"{API}/admin/deposits/detect-duplicates?scan_missing=true",
                          headers=admin["headers"], timeout=280)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        assert isinstance(body["scanned"], int)
        assert isinstance(body["scan_errors"], int)
        assert isinstance(body["duplicate_groups"], list)
