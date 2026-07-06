"""ASTRO API v3 — the universe, the agent, the journeys, the knowledge."""

from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.agent import run_agent
from app.config import (
    ALLOWED_MODELS,
    ALLOWED_ORIGINS,
    DEFAULT_MODEL,
    MAX_HISTORY_MESSAGES,
    MAX_TURN_CHARS,
)
from app.journeys import GRAND_TOUR, PRESET_THEMES, compose_journey
from app.knowledge import knowledge
from app.recognition import recognize

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="ASTRO", version="3.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_TURN_CHARS)


class StreamRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    model: str = DEFAULT_MODEL
    history: list[ChatTurn] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)


class JourneyRequest(BaseModel):
    theme: str = Field(min_length=3, max_length=500)
    model: str = DEFAULT_MODEL


@app.get("/health")
async def health():
    return {"status": "online", "agent": "ASTRO", "version": "3.0.0"}


@app.post("/api/agent/stream")
@limiter.limit("10/minute")
@limiter.limit("150/day")
async def agent_stream(request: Request, req: StreamRequest):
    model = req.model if req.model in ALLOWED_MODELS else DEFAULT_MODEL
    history = [{"role": t.role, "content": t.content} for t in req.history[-MAX_HISTORY_MESSAGES:]]
    return StreamingResponse(
        run_agent(req.query, model=model, history=history),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.get("/api/recognize")
@limiter.limit("60/minute")
async def recognize_endpoint(request: Request, q: str = Query(min_length=1, max_length=300)):
    """Instant recognition — lets the client aim the 3D universe before
    the agent stream even starts."""
    return recognize(q)


@app.get("/api/knowledge")
@limiter.limit("60/minute")
async def knowledge_endpoint(request: Request, limit: int = Query(default=400, ge=1, le=1000)):
    """The agent's memory as a constellation: stats + every learned fact
    as a positioned star."""
    return knowledge.constellation(limit)


@app.get("/api/journeys/presets")
@limiter.limit("60/minute")
async def journey_presets(request: Request):
    return {"presets": PRESET_THEMES}


@app.post("/api/journeys")
@limiter.limit("6/minute")
@limiter.limit("60/day")
async def create_journey(request: Request, req: JourneyRequest):
    if req.theme.strip().lower() in ("grand-tour", "the grand tour"):
        return GRAND_TOUR
    model = req.model if req.model in ALLOWED_MODELS else DEFAULT_MODEL
    try:
        return await compose_journey(req.theme.strip(), model)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Journey composer is unavailable right now (model quota or parse failure). "
                   "Try again shortly, another model, or launch The Grand Tour.",
        )
