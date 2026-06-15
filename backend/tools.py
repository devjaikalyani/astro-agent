import json
import os
import re
import requests
from typing import Optional
from data import CELESTIAL_DATABASE

_MEMORY_TOOLS = {"remember_fact", "recall_facts"}

_SIMBAD_TAP    = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
_EXOPLANET_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
_HORIZONS_API  = "https://horizons.jpl.nasa.gov/api/v1/"
_ADS_API       = "https://api.adsabs.harvard.edu/v1/search/query"
_MPC_API       = "https://minorplanetcenter.net"


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


def search_nasa_ads(query: str) -> dict:
    """Search NASA Astrophysics Data System for peer-reviewed research papers."""
    token = os.environ.get("ADS_API_KEY", "").strip()
    if not token:
        return {"found": False, "source": "NASA ADS", "error": "ADS_API_KEY not configured"}

    try:
        r = requests.get(
            _ADS_API,
            headers={"Authorization": f"Bearer {token}"},
            params={
                "q":    f'"{query}"',
                "fl":   "title,abstract,author,year,bibcode,citation_count,pub",
                "rows": 5,
                "sort": "citation_count desc",
            },
            timeout=10,
        )
        if r.ok:
            docs = r.json().get("response", {}).get("docs", [])
            if docs:
                return {
                    "found":  True,
                    "source": "NASA ADS",
                    "count":  len(docs),
                    "papers": [
                        {
                            "title":     (d.get("title") or [""])[0],
                            "authors":   (d.get("author") or [])[:3],
                            "year":      d.get("year"),
                            "journal":   d.get("pub", ""),
                            "citations": d.get("citation_count", 0),
                            "abstract":  (d.get("abstract") or "")[:500],
                            "bibcode":   d.get("bibcode", ""),
                        }
                        for d in docs
                    ],
                }
    except Exception:
        pass

    return {"found": False, "source": "NASA ADS", "query": query}


def search_mpc(query: str) -> dict:
    """Search the Minor Planet Center for asteroid and comet orbital data."""
    safe = query.strip()
    result: dict = {"query": safe, "found": False, "source": "Minor Planet Center"}

    # Attempt 1: MPC JSON object API
    try:
        r = requests.get(
            f"{_MPC_API}/api/objects/{requests.utils.quote(safe)}/",
            timeout=8,
        )
        if r.ok and r.headers.get("content-type", "").startswith("application/json"):
            data = r.json()
            if data:
                result.update({"found": True, **data})
                return result
    except Exception:
        pass

    # Attempt 2: MPC orbital elements (fixed-width text, always available)
    try:
        r = requests.get(
            f"{_MPC_API}/cgi-bin/showobsorbs.cgi",
            params={"Obj": safe, "orb": "y"},
            timeout=8,
        )
        if r.ok:
            text = r.text
            clean = re.sub(r"<[^>]+>", "", text).strip()
            useful = [l.strip() for l in clean.splitlines() if l.strip() and len(l.strip()) > 4]
            if len(useful) > 3:
                result.update({"found": True, "orbital_data": "\n".join(useful[:20])})
                return result
    except Exception:
        pass

    # Attempt 3: MPC comet search
    try:
        r = requests.get(
            f"{_MPC_API}/cgi-bin/returnprepeph.cgi",
            params={"d": safe, "t": "c"},
            timeout=8,
        )
        if r.ok and safe.lower() in r.text.lower():
            clean = re.sub(r"<[^>]+>", "", r.text).strip()
            useful = [l.strip() for l in clean.splitlines() if l.strip()]
            if useful:
                result.update({"found": True, "comet_data": "\n".join(useful[:15])})
                return result
    except Exception:
        pass

    result["message"] = "Object not found in MPC. Try the official designation (e.g. '(1) Ceres', '2020 QG')."
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
            "name": "recall_facts",
            "description": (
                "Search your persistent memory for relevant facts before answering. "
                "Call this FIRST for every query — it retrieves past tool discoveries and "
                "curated facts from previous sessions so you don't repeat work."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Topic or object name to search in memory"},
                },
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
                    "source":     {"type": "string", "description": "Data source: SIMBAD, JPL Horizons, NASA Exoplanet Archive, or known"},
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
                "Search NASA Astrophysics Data System (ADS) for peer-reviewed research papers. "
                "Use this to find the latest scientific findings, discovery papers, mission results, "
                "and cutting-edge research about any celestial object or astronomical phenomenon. "
                "Returns paper titles, authors, year, journal, citation counts, and abstract snippets."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Object name or topic to search for in the literature"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_mpc",
            "description": (
                "Search the Minor Planet Center (MPC) for asteroid and comet data. "
                "Returns orbital elements (semi-major axis, eccentricity, inclination, period), "
                "object classification (NEO, Atira, Aten, Apollo, Amor, TNO, MBA, etc.), "
                "discovery circumstances, and provisional designations. "
                "Best for minor planets, near-Earth objects, and comets not well-covered by JPL Horizons."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Object name or designation (e.g. 'Ceres', '2020 QG', 'Halley')"},
                },
                "required": ["query"],
            },
        },
    },
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
    # Memory tools are handled here to avoid a circular import
    if name == "remember_fact":
        from memory import memory
        return memory.store_fact(
            fact=tool_input.get("fact", ""),
            source=tool_input.get("source", "agent"),
            confidence=float(tool_input.get("confidence", 1.0)),
        )
    if name == "recall_facts":
        from memory import memory
        return memory.recall_tool(tool_input.get("query", ""))

    dispatch = {
        "search_nasa_ads":        search_nasa_ads,
        "search_mpc":             search_mpc,
        "search_live_astronomy":  lambda **kw: search_live_astronomy(**kw),
        "classify_celestial_body": classify_celestial_body,
        "get_celestial_info":     get_celestial_info,
        "search_by_property":     search_by_property,
        "compare_celestial_bodies": compare_celestial_bodies,
        "list_object_types":      list_object_types,
    }
    fn = dispatch.get(name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {name}"})
    return json.dumps(fn(**tool_input), default=str)
