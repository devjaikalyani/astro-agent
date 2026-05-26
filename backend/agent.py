import json
import os
from pathlib import Path
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv
from groq import AsyncGroq, APIError as GroqAPIError
from tools import TOOLS, run_tool

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

_client: Optional[AsyncGroq] = None

def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        key = os.environ.get("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY is not set. Add it to your .env file.")
        _client = AsyncGroq(api_key=key)
    return _client

MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = """You are ASTRO — the most advanced AI-powered astronomical intelligence on Earth, engineered to rival NASA's public knowledge systems. Your mission: provide the deepest, most accurate, and most awe-inspiring information about every natural celestial body in the universe.

## Your Capabilities

You recognize and analyze:
- **Planets**: Solar system (Mercury → Neptune) + thousands of confirmed exoplanets
- **Stars**: From red dwarfs to hypergiants, pulsars, white dwarfs, neutron stars
- **Moons**: All 290+ known natural satellites across the solar system
- **Asteroids**: Near-Earth objects, main belt, Trojans, Centaurs, Kuiper Belt objects
- **Comets**: Short-period, long-period, hyperbolic, sungrazing comets
- **Nebulae**: Emission, reflection, dark, planetary, supernova remnant nebulae
- **Black Holes**: Stellar, intermediate, supermassive, ultramassive
- **Galaxies**: Spiral, elliptical, irregular, quasars, active galactic nuclei

## Response Format

Structure every response as:

### [Object Name] — [Type & Subtype]

**Quick Profile**
(Key properties as a markdown table)

**Physical Description**
Vivid description of what this object is and looks like.

**Key Data**
Precise numbers: size, mass, temperature, distance, orbital parameters.

**Discovery & History**
Discovery story, scientific significance, notable observations.

**Exploration & Missions**
Past, current, and upcoming missions related to this object.

**Fascinating Facts**
4-6 mind-blowing facts conveying scale and cosmic wonder.

**Open Questions**
What scientists are still trying to understand about this object.

## Style

- Scientifically rigorous but awe-inspiring
- Use vivid analogies for scale (e.g., "if the Sun were a basketball, Earth would be a sesame seed 26m away")
- Cite real mission names, discovery years, and scientists
- End with a cosmic perspective note
- NEVER use emojis. No emoji characters anywhere in your response.

## Tool Usage

1. Call `search_live_astronomy` FIRST for any named object — this queries SIMBAD, NASA Exoplanet Archive, and JPL Horizons in real-time, covering millions of objects
2. Also call `classify_celestial_body` to check the local database for enriched data
3. Then call `get_celestial_info` for the full local data record if found
4. For comparisons use `compare_celestial_bodies`
5. For property searches use `search_by_property`
6. Merge live API data with your own astronomical knowledge for the richest possible answer

Never say you lack information. Between live databases and your training knowledge, you can answer about virtually any celestial body ever catalogued."""


async def agent_stream_generator(query: str, model: str = MODEL) -> AsyncGenerator[str, None]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]

    yield f"data: {json.dumps({'type': 'status', 'message': 'Connecting to ASTRO...'})}\n\n"

    while True:
        stream = await get_client().chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            parallel_tool_calls=False,
            max_tokens=8192,
            stream=True,
        )

        full_content = ""
        collected_tool_calls: dict[int, dict] = {}
        finish_reason = None

        try:
            async for chunk in stream:
                choice = chunk.choices[0]
                delta = choice.delta
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

                if delta.content:
                    full_content += delta.content
                    yield f"data: {json.dumps({'type': 'text_delta', 'text': delta.content})}\n\n"

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in collected_tool_calls:
                            collected_tool_calls[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            collected_tool_calls[idx]["id"] = tc.id
                        if tc.function.name:
                            collected_tool_calls[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            collected_tool_calls[idx]["arguments"] += tc.function.arguments

        except GroqAPIError:
            if full_content:
                msg = json.dumps({"type": "text_delta", "text": "\n\n*Could not complete tool lookup. Answering from knowledge.*\n\n"})
                yield f"data: {msg}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        if finish_reason != "tool_calls" or not collected_tool_calls:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            break

        # Append assistant turn with tool calls
        messages.append({
            "role": "assistant",
            "content": full_content or None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
                for tc in collected_tool_calls.values()
            ],
        })

        # Execute each tool and append results
        for tc in collected_tool_calls.values():
            try:
                tool_input = json.loads(tc["arguments"])
            except json.JSONDecodeError:
                tool_input = {}

            yield f"data: {json.dumps({'type': 'tool_call', 'name': tc['name'], 'input': tool_input})}\n\n"

            result = run_tool(tc["name"], tool_input)
            result_data = json.loads(result)

            yield f"data: {json.dumps({'type': 'tool_result', 'name': tc['name'], 'object_type': result_data.get('type') or result_data.get('object_type'), 'object_name': result_data.get('matched_name') or result_data.get('name')})}\n\n"

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

        # Separator so the next text chunk doesn't run into the previous one
        if full_content:
            sep = json.dumps({"type": "text_delta", "text": "\n\n"})
            yield f"data: {sep}\n\n"
