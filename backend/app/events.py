"""
SSE event protocol v3.

Every frame is `data: {json}\n\n` with a short `e` discriminator:

  recognition  body classified before any model call
  phase        human status line
  recalled     prior memories injected
  tool         tool started       (id, name, label, source)
  tool_done    tool finished      (id, summary, body?)
  learned      fact committed to permanent memory
  delta        streamed answer text
  fault        user-presentable error
  complete     stream end
"""

import json

TOOL_META: dict[str, dict[str, str]] = {
    "recall_facts":            {"label": "Recalling prior discoveries", "source": "MEMORY"},
    "remember_fact":           {"label": "Committing fact to memory", "source": "MEMORY"},
    "search_live_astronomy":   {"label": "Querying live sky databases", "source": "SIMBAD/EXO/JPL"},
    "search_nasa_ads":         {"label": "Scanning peer-reviewed research", "source": "NASA ADS"},
    "search_mpc":              {"label": "Pulling orbital elements", "source": "MPC"},
    "classify_celestial_body": {"label": "Recognizing object", "source": "ASTRO CORE"},
    "get_celestial_info":      {"label": "Loading local data record", "source": "ASTRO DB"},
    "search_by_property":      {"label": "Searching by property", "source": "ASTRO DB"},
    "compare_celestial_bodies": {"label": "Assembling comparison", "source": "ASTRO DB"},
    "list_object_types":       {"label": "Listing catalogued objects", "source": "ASTRO DB"},
}


def sse(event: str, **fields) -> str:
    return f"data: {json.dumps({'e': event, **fields})}\n\n"
