import json
import os
from pathlib import Path
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv
from anthropic import AsyncAnthropic
from tools import CLAUDE_TOOLS_CACHED, run_tool
from agent import SYSTEM_PROMPT

# System prompt as a cacheable block — Anthropic caches it after the first call.
# Render order is: tools → system → messages, so both stable parts get cached.
_SYSTEM_CACHED = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

_claude_client: Optional[AsyncAnthropic] = None


def get_claude_client() -> AsyncAnthropic:
    global _claude_client
    if _claude_client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")
        _claude_client = AsyncAnthropic(api_key=key)
    return _claude_client


async def claude_stream_generator(query: str, model: str = "claude-sonnet-4-6") -> AsyncGenerator[str, None]:
    client = get_claude_client()
    messages = [{"role": "user", "content": query}]

    yield f"data: {json.dumps({'type': 'status', 'message': 'Connecting to Claude...'})}\n\n"

    while True:
        full_text = ""

        async with client.messages.stream(
            model=model,
            max_tokens=8192,
            system=_SYSTEM_CACHED,
            messages=messages,
            tools=CLAUDE_TOOLS_CACHED,
        ) as stream:
            async for text in stream.text_stream:
                full_text += text
                yield f"data: {json.dumps({'type': 'text_delta', 'text': text})}\n\n"

            response = await stream.get_final_message()

        if response.stop_reason != "tool_use":
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            break

        # Append the assistant turn (with tool_use blocks)
        messages.append({"role": "assistant", "content": response.content})

        # Execute each tool and collect results
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            yield f"data: {json.dumps({'type': 'tool_call', 'name': block.name, 'input': block.input})}\n\n"

            result = run_tool(block.name, block.input)
            result_data = json.loads(result)

            yield f"data: {json.dumps({'type': 'tool_result', 'name': block.name, 'object_type': result_data.get('type') or result_data.get('object_type'), 'object_name': result_data.get('matched_name') or result_data.get('name')})}\n\n"

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})

        # Separator so the next text chunk doesn't run into the previous one
        if full_text:
            sep = json.dumps({"type": "text_delta", "text": "\n\n"})
            yield f"data: {sep}\n\n"
