import json
import os
from pathlib import Path
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv
from groq import AsyncGroq, APIError as GroqAPIError
from tools import TOOLS, run_tool, _MEMORY_TOOLS
from memory import memory

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

# Hard ceiling on agentic tool-calling rounds per query, so a misbehaving
# model can't loop on tools indefinitely and rack up unbounded token cost.
MAX_TURNS = 8


def _groq_error_message(e: Exception) -> str:
    """Turn a Groq API error into a friendly, actionable SSE message."""
    status = getattr(e, "status_code", None)
    if status in (413, 429):
        return (
            "This model hit its per-minute token limit on the free tier. "
            "Wait ~30s and retry, or switch to a different model."
        )
    return "Connection to ASTRO interrupted. Partial response shown."

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

## Memory

You have persistent memory that grows with every query answered:
1. Call `recall_facts` at the very start of every query — it retrieves relevant facts and past discoveries from previous sessions
2. After any live tool returns precise data (distances, masses, temperatures, orbital parameters, discovery dates), call `remember_fact` to store the key findings
3. Be selective — remember specific confirmed numbers and findings, not summaries
4. Memory compounds: the more queries you answer, the richer your knowledge base becomes

## Tool Usage

1. Call `recall_facts` FIRST — check what you already know from past sessions
2. Call `search_live_astronomy` for any named object — queries SIMBAD, NASA Exoplanet Archive, and JPL Horizons in real-time
3. Call `search_mpc` for any asteroid, comet, or minor planet — gets orbital elements, classification, and discovery info from the Minor Planet Center
4. Call `search_nasa_ads` to find the latest peer-reviewed research papers about the object — always include recent findings
5. Also call `classify_celestial_body` to check the local database for enriched data
6. Then call `get_celestial_info` for the full local data record if found
7. For comparisons use `compare_celestial_bodies`
8. For property searches use `search_by_property`
9. Call `remember_fact` after each live tool result to store precise findings
10. Merge all sources — live databases, research papers, memory, and your training knowledge — for the richest possible answer

Never say you lack information. Between live databases, memory, and your training knowledge, you can answer about virtually any celestial body ever catalogued."""


async def agent_stream_generator(query: str, model: str = MODEL) -> AsyncGenerator[str, None]:
    # Inject relevant memories as context before the first turn
    recalled = memory.recall(query)
    user_content = f"{recalled}\n\n---\n\nUser query: {query}" if recalled else query

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    yield f"data: {json.dumps({'type': 'status', 'message': 'Connecting to ASTRO...'})}\n\n"

    for turn in range(MAX_TURNS):
        # On the final allowed turn, stop offering tools so the model is
        # forced to produce a text answer instead of looping forever.
        use_tools = turn < MAX_TURNS - 1
        full_content = ""
        collected_tool_calls: dict[int, dict] = {}
        finish_reason = None

        try:
            # create() hits the API here, so it must be inside the try —
            # a 413/429 (rate/size limit) would otherwise crash the stream.
            stream = await get_client().chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS if use_tools else None,
                tool_choice="auto" if use_tools else "none",
                parallel_tool_calls=False,
                max_tokens=4000,
                stream=True,
            )
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

        except GroqAPIError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': _groq_error_message(e)})}\n\n"
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

            # Auto-store live tool results in vector memory
            if tc["name"] not in _MEMORY_TOOLS:
                memory.store_tool_result(query, tc["name"], result_data)

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
