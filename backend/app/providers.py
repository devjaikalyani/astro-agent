"""
Model-provider adapters behind one normalized interface, so the agent
orchestrator is provider-agnostic:

    stream_turn(allow_tools)  -> async generator of text deltas
    wants_tools / tool_calls  -> populated after the turn completes
    commit_assistant_turn()   -> append the assistant turn to history
    add_tool_result(call, s)  -> queue one tool result
    finish_tool_round()       -> flush queued results into history
"""

import json
import uuid
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional

from app.config import MAX_OUTPUT_TOKENS, MODEL_MAX_TOKENS, anthropic_key, groq_key
from app.prompts import SYSTEM_PROMPT
from app.toolkit import CLAUDE_TOOLS_CACHED, TOOLS


@dataclass
class ToolCall:
    id: str            # provider call id (returned to the provider)
    uid: str           # short id for SSE event matching in the UI
    name: str
    input: dict = field(default_factory=dict)


class ProviderError(Exception):
    """User-presentable streaming failure."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


def _uid() -> str:
    return uuid.uuid4().hex[:8]


# ── Groq (Llama / Gemma, OpenAI-compatible) ─────────────────────────────────

class GroqProvider:
    def __init__(self, model: str, history: list[dict], user_content: str):
        from groq import AsyncGroq

        key = groq_key()
        if not key:
            raise ProviderError("GROQ_API_KEY is not set. Add it to your .env file.")
        self._client = AsyncGroq(api_key=key)
        self.model = model
        self.messages: list[dict] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *history,
            {"role": "user", "content": user_content},
        ]
        self.wants_tools = False
        self.tool_calls: list[ToolCall] = []
        self._raw_calls: dict[int, dict] = {}
        self._turn_text = ""

    async def stream_turn(self, allow_tools: bool) -> AsyncGenerator[str, None]:
        from groq import APIError as GroqAPIError

        self.wants_tools = False
        self.tool_calls = []
        self._raw_calls = {}
        self._turn_text = ""
        finish_reason: Optional[str] = None

        try:
            stream = await self._client.chat.completions.create(
                model=self.model,
                messages=self.messages,
                tools=TOOLS if allow_tools else None,
                tool_choice="auto" if allow_tools else "none",
                parallel_tool_calls=False,
                max_tokens=MODEL_MAX_TOKENS.get(self.model, MAX_OUTPUT_TOKENS),
                stream=True,
            )
            async for chunk in stream:
                choice = chunk.choices[0]
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
                delta = choice.delta
                if delta.content:
                    self._turn_text += delta.content
                    yield delta.content
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        slot = self._raw_calls.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function.name:
                            slot["name"] = tc.function.name
                        if tc.function.arguments:
                            slot["arguments"] += tc.function.arguments
        except GroqAPIError as e:
            status = getattr(e, "status_code", None)
            if status in (413, 429):
                raise ProviderError(
                    "This model hit its per-minute token limit on the free tier. "
                    "Wait ~30s and retry, or switch to a different model.",
                    retryable=status == 429,
                ) from e
            raise ProviderError("Connection to ASTRO interrupted. Partial response shown.") from e

        if finish_reason == "tool_calls" and self._raw_calls:
            self.wants_tools = True
            for raw in self._raw_calls.values():
                try:
                    parsed = json.loads(raw["arguments"])
                except json.JSONDecodeError:
                    parsed = {}
                self.tool_calls.append(ToolCall(id=raw["id"], uid=_uid(), name=raw["name"], input=parsed))

    def commit_assistant_turn(self) -> None:
        self.messages.append({
            "role": "assistant",
            "content": self._turn_text or None,
            "tool_calls": [
                {
                    "id": raw["id"],
                    "type": "function",
                    "function": {"name": raw["name"], "arguments": raw["arguments"]},
                }
                for raw in self._raw_calls.values()
            ],
        })

    def add_tool_result(self, call: ToolCall, result: str) -> None:
        self.messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    def finish_tool_round(self) -> None:
        pass  # Groq appends results inline as role=tool messages


# ── Anthropic (Claude) ──────────────────────────────────────────────────────

# Cacheable system block — Anthropic caches it after the first call.
_SYSTEM_CACHED = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]


class ClaudeProvider:
    def __init__(self, model: str, history: list[dict], user_content: str):
        from anthropic import AsyncAnthropic

        key = anthropic_key()
        if not key:
            raise ProviderError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")
        self._client = AsyncAnthropic(api_key=key)
        self.model = model
        self.messages: list[dict] = [*history, {"role": "user", "content": user_content}]
        self.wants_tools = False
        self.tool_calls: list[ToolCall] = []
        self._response = None
        self._pending_results: list[dict] = []

    async def stream_turn(self, allow_tools: bool) -> AsyncGenerator[str, None]:
        from anthropic import APIError as AnthropicAPIError

        self.wants_tools = False
        self.tool_calls = []
        self._response = None

        # Tools stay defined on the forced-text turn (history holds tool_use
        # blocks); tool_choice=none blocks new calls.
        tool_choice = {"type": "auto"} if allow_tools else {"type": "none"}

        try:
            stream_ctx = self._client.messages.stream(
                model=self.model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=_SYSTEM_CACHED,
                messages=self.messages,
                tools=CLAUDE_TOOLS_CACHED,
                tool_choice=tool_choice,
            )
            async with stream_ctx as stream:
                async for text in stream.text_stream:
                    yield text
                self._response = await stream.get_final_message()
        except AnthropicAPIError as e:
            raise ProviderError("Connection to Claude interrupted. Partial response shown.") from e

        if self._response and self._response.stop_reason == "tool_use":
            self.wants_tools = True
            for block in self._response.content:
                if block.type == "tool_use":
                    self.tool_calls.append(
                        ToolCall(id=block.id, uid=_uid(), name=block.name, input=block.input or {})
                    )

    def commit_assistant_turn(self) -> None:
        if self._response:
            self.messages.append({"role": "assistant", "content": self._response.content})

    def add_tool_result(self, call: ToolCall, result: str) -> None:
        self._pending_results.append({
            "type": "tool_result",
            "tool_use_id": call.id,
            "content": result,
        })

    def finish_tool_round(self) -> None:
        if self._pending_results:
            self.messages.append({"role": "user", "content": self._pending_results})
            self._pending_results = []
