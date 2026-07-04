import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Always resolve .env relative to this file: backend/../.env
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(_env_path, override=True)

from classifier import classify
from memory import memory
from orchestrator import run_agent

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="ASTRO Agent API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

GROQ_MODELS = {"llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"}
CLAUDE_MODELS = {"claude-sonnet-4-6"}
ALLOWED_MODELS = GROQ_MODELS | CLAUDE_MODELS
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Bounds for follow-up conversation history sent by the client
MAX_HISTORY_TURNS = 12
MAX_TURN_CHARS = 24000


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_TURN_CHARS)


class AskRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    model: str = DEFAULT_MODEL
    history: list[ChatTurn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS * 2)


@app.get("/health")
async def health():
    return {"status": "online", "agent": "ASTRO", "version": "2.0.0"}


@app.post("/api/ask")
@limiter.limit("10/minute")
@limiter.limit("100/day")
async def ask(request: Request, req: AskRequest):
    model = req.model if req.model in ALLOWED_MODELS else DEFAULT_MODEL
    history = [{"role": t.role, "content": t.content} for t in req.history[-MAX_HISTORY_TURNS * 2:]]
    return StreamingResponse(
        run_agent(req.query, model=model, history=history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/classify")
@limiter.limit("60/minute")
async def classify_endpoint(request: Request, q: str = Query(min_length=1, max_length=300)):
    """Instant recognition — lets the client build the right 3D scene
    before the agent stream even starts."""
    return classify(q)


@app.get("/api/stats")
@limiter.limit("60/minute")
async def stats(request: Request):
    """What the agent has learned so far."""
    return memory.stats()


@app.get("/api/facts")
@limiter.limit("60/minute")
async def facts(request: Request, limit: int = Query(default=8, ge=1, le=50)):
    """Most recently learned facts — the agent's growing knowledge, visible."""
    return {"facts": memory.recent_facts(limit)}
