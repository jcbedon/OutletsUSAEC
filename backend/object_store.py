import os
import uuid
import requests
import logging

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "outletsusaec"
storage_key = None


def _get_emergent_key():
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("EMERGENT_LLM_KEY="):
                        key = line.strip().split("=", 1)[1]
                        break
    return key


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    key = _get_emergent_key()
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialized")
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "heic": "image/heic",
    "pdf": "application/pdf", "json": "application/json",
}


def upload_file(data: bytes, filename: str, subfolder: str = "general") -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    unique_name = f"{uuid.uuid4().hex[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    path = f"{APP_NAME}/{subfolder}/{unique_name}"
    result = put_object(path, data, content_type)
    return result["path"]
