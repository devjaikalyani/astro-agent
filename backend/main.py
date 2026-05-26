import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Always resolve .env relative to this file: backend/../.env
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(_env_path, override=True)

from agent import agent_stream_generator
from agent_claude import claude_stream_generator

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Astro Agent API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


GROQ_MODELS = {"llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"}
CLAUDE_MODELS = {"claude-sonnet-4-6"}
ALLOWED_MODELS = GROQ_MODELS | CLAUDE_MODELS

class QueryRequest(BaseModel):
    query: str
    model: str = "llama-3.3-70b-versatile"


@app.get("/health")
async def health():
    return {"status": "online", "agent": "ASTRO"}


@app.post("/api/ask")
@limiter.limit("10/minute")
@limiter.limit("100/day")
async def ask(request: Request, req: QueryRequest):
    model = req.model if req.model in ALLOWED_MODELS else "llama-3.3-70b-versatile"
    generator = (
        claude_stream_generator(req.query, model=model)
        if model in CLAUDE_MODELS
        else agent_stream_generator(req.query, model=model)
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
