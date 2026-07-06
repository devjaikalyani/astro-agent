"""Agent tool schemas (OpenAI + Anthropic formats) and the dispatcher."""

import json
from typing import Optional

from app.celestial_db import CELESTIAL_DATABASE
from app.live_data import search_live_astronomy, search_mpc, search_nasa_ads
from app.recognition import recognize

MEMORY_TOOLS = {"remember_fact", "recall_facts"}


def _search_database(query: str) -> tuple:
    q = query.lower().strip()
    for category, objects in CELESTIAL_DATABASE.items():
        for name, data in objects.items():
            if q == name or q in name or name in q:
                return name, data
    return None, None


def classify_celestial_body(query: str) -> dict:
    c = recognize(query)
    return {
        "found_in_database": c["method"] == "database",
        "matched_name": c["name"],
        "object_type": c["object_type"],
        "scene": c["scene"],
        "object_subtype": c["subtype"],
        "confidence": c["confidence"],
        "method": c["method"],
        **({} if c["object_type"] else {"note": "Not recognized locally — use live tools and your knowledge."}),
    }


def get_celestial_info(name: str, object_type: Optional[str] = None) -> dict:
    matched_name, data = _search_database(name)
    if data:
        return {"source": "database", "name": matched_name, **data}
    return {
        "source": "not_in_database",
        "name": name,
        "object_type": object_type,
        "instruction": "Use your astronomical knowledge to provide accurate, detailed information.",
    }


def search_by_property(property_name: str, value_hint: str, object_type: Optional[str] = None) -> dict:
    results = []
    for category, objects in CELESTIAL_DATABASE.items():
        if object_type and object_type.lower().rstrip("s") not in category:
            continue
        for name, data in objects.items():
            if value_hint.lower() in json.dumps(data, default=str).lower():
                results.append({"name": name, "type": data.get("type"), "category": category})
    return {"results": results, "count": len(results)}


def compare_celestial_bodies(body1: str, body2: str) -> dict:
    _, data1 = _search_database(body1)
    _, data2 = _search_database(body2)
    return {
        "body1": {"name": body1, "data": data1 or "use your knowledge"},
        "body2": {"name": body2, "data": data2 or "use your knowledge"},
        "instruction": "Provide a rich comparative analysis.",
    }


def list_object_types(object_type: str) -> dict:
    type_map = {
        "planet": "planets", "planets": "planets",
        "star": "stars", "stars": "stars",
        "moon": "moons", "moons": "moons",
        "asteroid": "asteroids", "asteroids": "asteroids",
        "comet": "comets", "comets": "comets",
        "nebula": "nebulae", "nebulae": "nebulae",
        "black_hole": "black_holes", "black_holes": "black_holes",
        "galaxy": "galaxies", "galaxies": "galaxies",
    }
    category = type_map.get(object_type.lower().replace(" ", "_"))
    if not category or category not in CELESTIAL_DATABASE:
        return {"error": f"Unknown type: {object_type}"}
    return {
        "type": category,
        "objects": list(CELESTIAL_DATABASE[category].keys()),
        "count": len(CELESTIAL_DATABASE[category]),
    }


# ── Schemas (OpenAI-compatible; Anthropic derived below) ────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recall_facts",
            "description": (
                "Search your persistent memory for relevant facts before answering. "
                "Call this FIRST for every query — it retrieves past tool discoveries and "
                "curated facts from previous sessions so you don't repeat work."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Topic or object name to search in memory"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember_fact",
            "description": (
                "Permanently store an important astronomical fact you just discovered from a live data source. "
                "Call this after any tool returns precise new data: distances, masses, temperatures, "
                "orbital parameters, discovery dates, composition, mission findings. "
                "Stored facts are recalled automatically in future sessions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "fact":       {"type": "string", "description": "The fact, stated precisely and completely"},
                    "source":     {"type": "string", "description": "Data source: SIMBAD, JPL Horizons, NASA Exoplanet Archive, NASA ADS, MPC, or known"},
                    "confidence": {"type": "number", "description": "Confidence 0.0 to 1.0"},
                },
                "required": ["fact", "source"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_nasa_ads",
            "description": (
                "Search NASA Astrophysics Data System (ADS) for peer-reviewed research papers: "
                "latest findings, discovery papers, mission results. Returns titles, authors, year, "
                "journal, citations, abstract snippets."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Object name or topic to search in the literature"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_mpc",
            "description": (
                "Search the Minor Planet Center for asteroid and comet data: orbital elements, "
                "classification (NEO, Atira, Aten, Apollo, Amor, TNO, MBA), discovery circumstances, "
                "provisional designations."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Object name or designation (e.g. 'Ceres', '2020 QG', 'Halley')"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_live_astronomy",
            "description": (
                "Search real-time astronomical databases: SIMBAD CDS (stars, galaxies, nebulae, "
                "clusters, quasars), NASA Exoplanet Archive (5500+ confirmed exoplanets), and "
                "JPL Horizons (solar system bodies). Use for obscure objects, catalog IDs, live data."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Object name, catalog ID (M42, NGC 224, HD 209458 b), or common name"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "classify_celestial_body",
            "description": "Identify the type of celestial body (planet, star, moon, asteroid, comet, nebula, black hole, galaxy) from a name or description.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Name or description of the object"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_celestial_info",
            "description": "Retrieve the full curated data record for a celestial body from the local database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name of the celestial body"},
                    "object_type": {"type": "string", "description": "Type: planet, star, moon, asteroid, comet, nebula, black_hole, galaxy"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_by_property",
            "description": "Search the local database for bodies matching a property (e.g. 'subsurface ocean', 'habitable', 'rings').",
            "parameters": {
                "type": "object",
                "properties": {
                    "property_name": {"type": "string"},
                    "value_hint": {"type": "string", "description": "Keyword to match in the data"},
                    "object_type": {"type": "string", "description": "Optional filter by type"},
                },
                "required": ["property_name", "value_hint"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_celestial_bodies",
            "description": "Compare two celestial bodies side by side.",
            "parameters": {
                "type": "object",
                "properties": {"body1": {"type": "string"}, "body2": {"type": "string"}},
                "required": ["body1", "body2"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_object_types",
            "description": "List all known objects of a given type in the local database.",
            "parameters": {
                "type": "object",
                "properties": {"object_type": {"type": "string", "description": "planets, stars, moons, asteroids, comets, nebulae, black_holes, galaxies"}},
                "required": ["object_type"],
            },
        },
    },
]

CLAUDE_TOOLS = [
    {
        "name": t["function"]["name"],
        "description": t["function"]["description"],
        "input_schema": t["function"]["parameters"],
    }
    for t in TOOLS
]

# cache_control on the last tool caches the whole (stable) tool list.
CLAUDE_TOOLS_CACHED = [
    *CLAUDE_TOOLS[:-1],
    {**CLAUDE_TOOLS[-1], "cache_control": {"type": "ephemeral"}},
]


def _coerce_confidence(value, default: float = 1.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def run_tool(name: str, tool_input: dict) -> str:
    """Dispatch a tool call. Always returns a JSON string and never raises —
    a misbehaving model must not tear down the SSE stream."""
    if not isinstance(tool_input, dict):
        tool_input = {}

    try:
        if name == "remember_fact":
            from app.knowledge import knowledge
            return knowledge.store_fact(
                fact=str(tool_input.get("fact", "")),
                source=str(tool_input.get("source", "agent")),
                confidence=_coerce_confidence(tool_input.get("confidence", 1.0)),
            )
        if name == "recall_facts":
            from app.knowledge import knowledge
            return knowledge.recall_tool(str(tool_input.get("query", "")))

        dispatch = {
            "search_nasa_ads":          search_nasa_ads,
            "search_mpc":               search_mpc,
            "search_live_astronomy":    search_live_astronomy,
            "classify_celestial_body":  classify_celestial_body,
            "get_celestial_info":       get_celestial_info,
            "search_by_property":       search_by_property,
            "compare_celestial_bodies": compare_celestial_bodies,
            "list_object_types":        list_object_types,
        }
        fn = dispatch.get(name)
        if not fn:
            return json.dumps({"error": f"Unknown tool: {name}"})

        # Pass only kwargs the function accepts — models emit stray args.
        allowed = fn.__code__.co_varnames[: fn.__code__.co_argcount]
        kwargs = {k: v for k, v in tool_input.items() if k in allowed}
        return json.dumps(fn(**kwargs), default=str)
    except Exception as e:
        return json.dumps({"error": f"Tool '{name}' failed: {e}"})


def summarize_result(name: str, data: dict) -> str:
    """One-line human summary for the mission feed."""
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
