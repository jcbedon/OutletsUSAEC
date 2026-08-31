"""Seed / cleanup a fake image-duplicate group for frontend UI testing."""
import sys
import uuid
from datetime import datetime, timezone

from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]

REF = "testuiduplicate999"
action = sys.argv[1] if len(sys.argv) > 1 else "seed"

if action == "clean":
    res = db.wallet_transactions.delete_many({"description": "TEST_UI_dup_group"})
    print("deleted", res.deleted_count)
else:
    user = db.users.find_one({"customer_id": "A2824"}, {"_id": 0})
    for i in range(2):
        db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": user["tenant_id"], "user_id": user["id"],
            "customer_id": "A2824", "type": "deposit", "amount": 50.0 + i,
            "status": "pending" if i else "approved", "description": "TEST_UI_dup_group",
            "reference_number": f"TEST-UI-{i}", "reference_number_lower": f"test-ui-{i}",
            "proof_url": "/api/uploads/proofs/TEST_fake.png",
            "ai_scan": {"detected_reference_number": REF.upper(), "confidence": "high"},
            "ai_detected_reference_lower": REF,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    print("seeded group", REF)
