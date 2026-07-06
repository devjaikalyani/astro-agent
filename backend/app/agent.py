"""
The ASTRO agentic loop — one orchestrator for every model provider,
emitting SSE protocol v3 (see app/events.py).

Pipeline per query:
  1. Instant recognition   -> `recognition` event before any model call
  2. Memory recall         -> past discoveries injected as context
  3. Agentic tool loop     -> the model autonomously works the live
                              observatory network; every call streams events
  4. Learning              -> discoveries auto-indexed, curated facts stored
  5. Streaming synthesis   -> markdown analysis streamed token by token
"""

import asyncio
import json
from typing import AsyncGenerator

from app.config import CLAUDE_MODELS, MAX_AGENT_ROUNDS
from app.events import TOOL_META, sse
from app.knowledge import knowledge
from app.providers import ClaudeProvider, GroqProvider, ProviderError
from app.recognition import recognize
from app.toolkit import MEMORY_TOOLS, run_tool, summarize_result


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

    # ── 1. Instant recognition ──────────────────────────────────────────────
    rec = recognize(query)
    if not is_followup or rec["object_type"]:
        yield sse("recognition", body={
            "object_type": rec["object_type"],
            "scene": rec["scene"],
            "name": rec["name"],
            "solar_body": rec["solar_body"],
            "confidence": rec["confidence"],
            "method": rec["method"],
        })

    yield sse("phase", label="Linking observatory network")

    # ── 2. Memory recall (first turn only) ──────────────────────────────────
    user_content = query
    if not is_followup:
        recalled = knowledge.recall(query)
        if recalled:
            user_content = f"{recalled}\n\n---\n\nUser query: {query}"
            yield sse("recalled", detail="Prior discoveries loaded from memory")

    try:
        provider = _make_provider(model, history, user_content)
    except ProviderError as e:
        yield sse("fault", message=str(e))
        yield sse("complete")
        return

    # ── 3-5. Agentic loop ───────────────────────────────────────────────────
    retried = False
    for round_no in range(MAX_AGENT_ROUNDS):
        # Final allowed round forces a text answer — no infinite tool loops.
        allow_tools = round_no < MAX_AGENT_ROUNDS - 1
        emitted_text = False

        try:
            async for text in provider.stream_turn(allow_tools):
                emitted_text = True
                yield sse("delta", t=text)
        except ProviderError as e:
            # One automatic backoff for transient rate limits, but only if
            # no partial text has reached the client yet.
            if e.retryable and not retried and not emitted_text:
                retried = True
                yield sse("phase", label="Rate limit hit — retrying in 20s")
                await asyncio.sleep(20)
                try:
                    async for text in provider.stream_turn(allow_tools):
                        emitted_text = True
                        yield sse("delta", t=text)
                except ProviderError as e2:
                    yield sse("fault", message=str(e2))
                    yield sse("complete")
                    return
            else:
                yield sse("fault", message=str(e))
                yield sse("complete")
                return

        if not provider.wants_tools:
            yield sse("complete")
            return

        provider.commit_assistant_turn()

        for call in provider.tool_calls:
            meta = TOOL_META.get(call.name, {"label": call.name, "source": "TOOL"})
            yield sse("tool", id=call.uid, name=call.name, label=meta["label"], source=meta["source"])

            result = run_tool(call.name, call.input)
            try:
                result_data = json.loads(result)
            except json.JSONDecodeError:
                result_data = {}

            # Learning: every live discovery is indexed automatically
            if call.name not in MEMORY_TOOLS:
                knowledge.index_discovery(query, call.name, result_data)

            if call.name == "remember_fact" and result_data.get("stored"):
                yield sse("learned", fact=str(call.input.get("fact", ""))[:180])

            yield sse(
                "tool_done",
                id=call.uid,
                summary=summarize_result(call.name, result_data),
                body={
                    "object_type": result_data.get("type") or result_data.get("object_type"),
                    "scene": result_data.get("scene"),
                    "name": result_data.get("matched_name") or result_data.get("name"),
                },
            )

            provider.add_tool_result(call, result)

        provider.finish_tool_round()

        # Separator so the next text chunk doesn't run into the previous one
        if emitted_text:
            yield sse("delta", t="\n\n")

    yield sse("complete")
