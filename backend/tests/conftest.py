"""Shared test bootstrap.

Several legacy test modules read REACT_APP_BACKEND_URL from os.environ at import
time (and some hardcode a URL as fallback). conftest is imported before the test
modules, so we populate the process env from /app/frontend/.env here to keep every
suite pointed at the single source of truth (no hardcoded URLs).
"""
import os

from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
_url = os.environ.get("REACT_APP_BACKEND_URL") or _frontend_env.get("REACT_APP_BACKEND_URL")
if not _url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing from process env and /app/frontend/.env")
os.environ["REACT_APP_BACKEND_URL"] = _url.rstrip("/")
