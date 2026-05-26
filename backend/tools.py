import json
import requests
from typing import Optional
from data import CELESTIAL_DATABASE

_SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
_EXOPLANET_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
_HORIZONS_API = "https://horizons.jpl.nasa.gov/api/v1/"


def _search_database(query: str) -> tuple:
    q = query.lower().strip()
    for category, objects in CELESTIAL_DATABASE.items():
        for name, data in objects.items():
            if q == name or q in name or name in q:
                return name, data
    return None, None


def _simbad_query(adql: str) -> Optional[dict]:
    """Run a SIMBAD TAP query and return the first row as a dict, or None."""
    try:
        r = requests.get(
            _SIMBAD_TAP,
            params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": adql},
            timeout=8,
        )
        if r.ok:
            data = r.json()
            if data.get("data"):
                cols = [m["name"] for m in data["metadata"]]
                row = dict(zip(cols, data["data"][0]))
                return {k: v for k, v in row.items() if v is not None}
    except Exception:
        pass
    return None


def search_live_astronomy(query: str) -> dict:
    """Query SIMBAD CDS, NASA Exoplanet Archive, and JPL Horizons for real-time data."""
    safe = query.replace("'", "''").strip()
    result = {"query": query, "found": False, "sources": []}

    # ── 1. SIMBAD (stars, galaxies, nebulae, clusters, quasars) ─────────────
    _COLS = "b.main_id, b.otype, b.ra, b.dec, b.sp_type, b.morph_type, b.rvz_radvel, b.plx_value"
    _FROM = "FROM basic b JOIN ident i ON i.oidref = b.oid"

    simbad_row = (
        _simbad_query(f"SELECT TOP 1 {_COLS} {_FROM} WHERE i.id = '{safe}'")
        or _simbad_query(f"SELECT TOP 1 {_COLS} {_FROM} WHERE i.id = 'NAME {safe}'")
        or _simbad_query(f"SELECT TOP 1 {_COLS} {_FROM} WHERE i.id LIKE '{safe}%'")
    )
    if simbad_row:
        result["simbad"] = simbad_row
        result["found"] = True
        result["sources"].append("SIMBAD CDS")

    # ── 2. NASA Exoplanet Archive (confirmed exoplanets) ────────────────────
    try:
        exo_query = (
            "SELECT TOP 5 pl_name, pl_orbper, pl_rade, pl_bmasse, pl_eqt, "
            "pl_orbsmax, sy_dist, hostname, disc_year, discoverymethod "
            f"FROM ps WHERE LOWER(pl_name) LIKE LOWER('%{safe}%')"
        )
        r = requests.get(
            _EXOPLANET_TAP,
            params={"query": exo_query, "format": "json"},
            timeout=8,
        )
        if r.ok and r.text.strip():
            rows = r.json()
            if rows:
                result["exoplanet_archive"] = rows[:3]
                result["found"] = True
                result["sources"].append("NASA Exoplanet Archive")
    except Exception:
        pass

    # ── 3. JPL Horizons (solar system bodies) ───────────────────────────────
    try:
        r = requests.get(
            _HORIZONS_API,
            params={
                "format": "json",
                "COMMAND": f"'{safe}'",
                "MAKE_EPHEM": "NO",
                "OBJECT_DATA": "YES",
            },
            timeout=8,
        )
        if r.ok:
            jpl = r.json()
            if jpl.get("result") and "No matches" not in jpl["result"]:
                result["jpl_horizons"] = {
                    "raw_summary": jpl["result"][:800]
                }
                result["found"] = True
                result["sources"].append("JPL Horizons")
    except Exception:
        pass

    if not result["found"]:
        result["message"] = (
            "Object not found in live databases. "
            "Use your full astronomical training knowledge to answer."
        )

    return result


def classify_celestial_body(query: str) -> dict:
    name, data = _search_database(query)
    if data:
        return {
            "found_in_database": True,
            "matched_name": name,
            "object_type": data.get("type"),
            "object_subtype": data.get("subtype"),
            "confidence": "high",
        }
    return {
        "found_in_database": False,
        "query": query,
        "confidence": "use Claude knowledge",
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
        "body1": {"name": body1, "data": data1 or "use Claude knowledge"},
        "body2": {"name": body2, "data": data2 or "use Claude knowledge"},
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


# Groq uses OpenAI-compatible tool format
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_live_astronomy",
            "description": (
                "Search real-time astronomical databases for any celestial object: "
                "SIMBAD CDS (stars, galaxies, nebulae, clusters, quasars), "
                "NASA Exoplanet Archive (5500+ confirmed exoplanets), "
                "and JPL Horizons (solar system bodies with precise ephemeris). "
                "Use this for obscure objects, catalog IDs, or to get live data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Object name, catalog ID (M42, NGC 224, HD 209458 b), or common name",
                    },
                },
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
                "properties": {
                    "query": {"type": "string", "description": "Name or description of the object"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_celestial_info",
            "description": "Retrieve detailed information about a celestial body from the database.",
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
            "description": "Search the database for celestial bodies matching a property (e.g., 'subsurface ocean', 'habitable', 'supernova', 'rings').",
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
                "properties": {
                    "body1": {"type": "string"},
                    "body2": {"type": "string"},
                },
                "required": ["body1", "body2"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_object_types",
            "description": "List all known objects of a given type in the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "object_type": {"type": "string", "description": "planets, stars, moons, asteroids, comets, nebulae, black_holes, galaxies"},
                },
                "required": ["object_type"],
            },
        },
    },
]


# Anthropic format (input_schema instead of parameters, no "function" wrapper)
CLAUDE_TOOLS = [
    {
        "name": t["function"]["name"],
        "description": t["function"]["description"],
        "input_schema": t["function"]["parameters"],
    }
    for t in TOOLS
]

# Cache_control on the last tool tells Anthropic to cache everything up to
# and including the full tool list — tools are stable across every request.
CLAUDE_TOOLS_CACHED = [
    *CLAUDE_TOOLS[:-1],
    {**CLAUDE_TOOLS[-1], "cache_control": {"type": "ephemeral"}},
]


def run_tool(name: str, tool_input: dict) -> str:
    dispatch = {
        "search_live_astronomy": lambda **kw: search_live_astronomy(**kw),
        "classify_celestial_body": classify_celestial_body,
        "get_celestial_info": get_celestial_info,
        "search_by_property": search_by_property,
        "compare_celestial_bodies": compare_celestial_bodies,
        "list_object_types": list_object_types,
    }
    fn = dispatch.get(name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {name}"})
    return json.dumps(fn(**tool_input), default=str)
