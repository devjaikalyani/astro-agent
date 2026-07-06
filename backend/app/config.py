"""ASTRO configuration: environment, model registry, limits."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Always resolve .env relative to the repo root: backend/app/../../.env
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(ENV_PATH, override=True)

STORE_DIR = Path(__file__).resolve().parent.parent / "memory_store"

GROQ_MODELS = {"llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"}
CLAUDE_MODELS = {"claude-sonnet-4-6"}
ALLOWED_MODELS = GROQ_MODELS | CLAUDE_MODELS
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Groq's free tier counts reserved max_tokens against a per-request TPM
# ceiling (~6k for 8B-class models), so small models get smaller budgets.
MODEL_MAX_TOKENS = {
    "llama-3.1-8b-instant": 1500,
    "gemma2-9b-it": 2000,
}
MAX_OUTPUT_TOKENS = 4000

# Hard ceiling on agentic tool rounds per query.
MAX_AGENT_ROUNDS = 8

# Conversation history bounds.
MAX_HISTORY_MESSAGES = 24
MAX_TURN_CHARS = 24000

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")


def groq_key() -> str | None:
    return os.environ.get("GROQ_API_KEY")


def anthropic_key() -> str | None:
    return os.environ.get("ANTHROPIC_API_KEY")


def ads_key() -> str:
    return os.environ.get("ADS_API_KEY", "").strip()
