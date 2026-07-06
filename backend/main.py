"""Entry shim so `uvicorn main:app` (nodemon) serves the app package."""

from app.main import app  # noqa: F401
