"""
The ASTRO agentic loop — one orchestrator for every model provider.

Pipeline per query:
  1. Instant recognition   -> `classified` event before any model call
  2. Memory recall         -> past discoveries injected as context
  3. Agentic tool loop     -> the model autonomously calls live observatory
                              tools; every call/result is streamed as an event
  4. Learning              -> live results auto-stored in vector memory,
                              agent-curated facts stored via remember_fact
  5. Streaming synthesis   -> markdown analysis streamed token by token

SSE event types:
  classified, status, text_delta, tool_call, tool_result, memory, error, done
"""

import asyncio
import json
from typing import AsyncGenerator

from classifier import classify
from memory import memory
from providers import ClaudeProvider, GroqProvider, ProviderError, ToolCall
from tools import run_tool, _MEMORY_TOOLS

# Hard ceiling on agentic tool-calling rounds per query, so a misbehaving
# model can't loop on tools indefinitely and rack up unbounded token cost.
MAX_TURNS = 8

CLAUDE_MODELS = {"claude-sonnet-4-6"}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _summarize_result(name: str, data: dict) -> str:
    """One-line human summary of a tool result for the mission log."""
    try:
        if name == "search_live_astronomy":
            sources = data.get("sources") or []
            return ", ".join(sources) if sources else "no live match"
        if name == "search_nasa_ads":
            return f"{data.get('count', 0)} papers found" if data.get("found") else "no papers found"
        if name == "search_mpc":
            return "orbital data retrieved" if data.get("found") else "not in MPC"
        if name == "classify_celestial_body":
            t = data.get("object_type")
            return f"recognized as {t}" if t else "not recognized"
        if name == "recall_facts":
            memories = str(data.get("memories", ""))
            return "no prior memories" if "No relevant" in memories else "prior discoveries recalled"
        if name == "remember_fact":
            return "fact stored" if data.get("stored") else "store failed"
        if name == "get_celestial_info":
            return "database record loaded" if data.get("source") == "database" else "not in local database"
        if name == "compare_celestial_bodies":
            return "comparison data assembled"
        if name == "search_by_property":
            return f"{data.get('count', 0)} matches"
        if name == "list_object_types":
            return f"{data.get('count', 0)} objects listed"
    except Exception:
        pass
    return "done"


def _make_provider(model: str, history: list[dict], user_content: str):
    if model in CLAUDE_MODELS:
        return ClaudeProvider(model, history, user_content)
    return GroqProvider(model, history, user_content)


async def run_agent(
    query: str,
    model: str,
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    history = history or []
    is_followup = len(history) > 0

    # ── 1. Instant recognition — before any model call ─────────────────────
    recognition = classify(query)
    if not is_followup or recognition["object_type"]:
        yield _sse({
            "type": "classified",
            "object_type": recognition["object_type"],
            "scene_type": recognition["scene_type"],
            "object_name": recognition["matched_name"],
            "confidence": recognition["confidence"],
            "method": recognition["method"],
        })

    yield _sse({"type": "status", "message": "Linking observatory network"})

    # ── 2. Memory recall — inject prior discoveries on the first turn ──────
    user_content = query
    if not is_followup:
        recalled = memory.recall(query)
        if recalled:
            user_content = f"{recalled}\n\n---\n\nUser query: {query}"
            yield _sse({"type": "memory", "action": "recalled", "detail": "Prior discoveries loaded from memory"})

    try:
        provider = _make_provider(model, history, user_content)
    except ProviderError as e:
        yield _sse({"type": "error", "message": str(e)})
        yield _sse({"type": "done"})
        return

    # ── 3-5. Agentic loop ───────────────────────────────────────────────────
    retried = False
    for turn in range(MAX_TURNS):
        # On the final allowed turn, force a text answer so the agent can
        # never loop on tools forever.
        allow_tools = turn < MAX_TURNS - 1
        emitted_text = False

        try:
            async for text in provider.stream_turn(allow_tools):
                emitted_text = True
                yield _sse({"type": "text_delta", "text": text})
        except ProviderError as e:
            # One automatic backoff-and-retry for transient rate limits,
            # but only if no partial text has reached the client yet.
            if e.retryable and not retried and not emitted_text:
                retried = True
                yield _sse({"type": "status", "message": "Rate limit hit — retrying in 20s"})
                await asyncio.sleep(20)
                try:
                    async for text in provider.stream_turn(allow_tools):
                        emitted_text = True
                        yield _sse({"type": "text_delta", "text": text})
                except ProviderError as e2:
                    yield _sse({"type": "error", "message": str(e2)})
                    yield _sse({"type": "done"})
                    return
            else:
                yield _sse({"type": "error", "message": str(e)})
                yield _sse({"type": "done"})
                return

        if not provider.wants_tools:
            yield _sse({"type": "done"})
            return

        provider.commit_assistant_turn()

        for call in provider.tool_calls:
            yield _sse({"type": "tool_call", "name": call.name, "input": call.input})

            result = run_tool(call.name, call.input)
            try:
                result_data = json.loads(result)
            except json.JSONDecodeError:
                result_data = {}

            # Learning: auto-store every live discovery in vector memory
            if call.name not in _MEMORY_TOOLS:
                memory.store_tool_result(query, call.name, result_data)

            if call.name == "remember_fact" and result_data.get("stored"):
                yield _sse({
                    "type": "memory",
                    "action": "stored",
                    "detail": str(call.input.get("fact", ""))[:160],
                })

            yield _sse({
                "type": "tool_result",
                "name": call.name,
                "object_type": result_data.get("type") or result_data.get("object_type"),
                "scene_type": result_data.get("scene_type"),
                "object_name": result_data.get("matched_name") or result_data.get("name"),
                "summary": _summarize_result(call.name, result_data),
            })

            provider.add_tool_result(call, result)

        provider.finish_tool_round()

        # Separator so the next text chunk doesn't run into the previous one
        if emitted_text:
            yield _sse({"type": "text_delta", "text": "\n\n"})

    yield _sse({"type": "done"})
