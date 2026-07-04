"""
ASTRO recognition engine.

Deterministic celestial-body recognition that runs before the LLM ever sees
the query, so the client knows what it is looking at within milliseconds:

  1. Local database match  (200+ curated bodies across 8 categories)
  2. Famous catalog objects (Messier / NGC / named deep-sky table)
  3. Catalog-designation patterns (HD, HIP, PSR, Kepler-, C/, provisional
     minor-planet designations, ...)
  4. Keyword heuristics (last resort)

Returns both the scientific `object_type` and the `scene_type` the frontend
uses to build the volumetric 3D scene (e.g. Saturn is a planet scientifically
but renders as `ringed_planet`).
"""

import re
from typing import Optional, TypedDict

from data import CELESTIAL_DATABASE

# data.py category -> canonical object type
_CATEGORY_TYPE = {
    "planets": "planet",
    "stars": "star",
    "moons": "moon",
    "asteroids": "asteroid",
    "comets": "comet",
    "nebulae": "nebula",
    "black_holes": "black_hole",
    "galaxies": "galaxy",
}

# Famous deep-sky catalog objects the local DB may not list under their
# catalog IDs. Messier and common NGC numbers people actually type.
_CATALOG_OBJECTS: dict[str, tuple[str, str]] = {
    # id -> (object_type, proper name)
    "m1":   ("nebula", "Crab Nebula"),
    "m8":   ("nebula", "Lagoon Nebula"),
    "m13":  ("star", "Hercules Cluster"),
    "m16":  ("nebula", "Eagle Nebula"),
    "m17":  ("nebula", "Omega Nebula"),
    "m20":  ("nebula", "Trifid Nebula"),
    "m27":  ("nebula", "Dumbbell Nebula"),
    "m31":  ("galaxy", "Andromeda Galaxy"),
    "m33":  ("galaxy", "Triangulum Galaxy"),
    "m42":  ("nebula", "Orion Nebula"),
    "m45":  ("star", "Pleiades"),
    "m51":  ("galaxy", "Whirlpool Galaxy"),
    "m57":  ("nebula", "Ring Nebula"),
    "m63":  ("galaxy", "Sunflower Galaxy"),
    "m64":  ("galaxy", "Black Eye Galaxy"),
    "m81":  ("galaxy", "Bode's Galaxy"),
    "m82":  ("galaxy", "Cigar Galaxy"),
    "m87":  ("galaxy", "Messier 87"),
    "m101": ("galaxy", "Pinwheel Galaxy"),
    "m104": ("galaxy", "Sombrero Galaxy"),
    "ngc 224":  ("galaxy", "Andromeda Galaxy"),
    "ngc 1952": ("nebula", "Crab Nebula"),
    "ngc 1976": ("nebula", "Orion Nebula"),
    "ngc 5194": ("galaxy", "Whirlpool Galaxy"),
    "ngc 7293": ("nebula", "Helix Nebula"),
    "ngc 3372": ("nebula", "Carina Nebula"),
    "ngc 6543": ("nebula", "Cat's Eye Nebula"),
}

# Designation patterns, checked in order. First match wins.
_DESIGNATION_RULES: list[tuple[re.Pattern, str]] = [
    # Pulsars / neutron stars
    (re.compile(r"^psr\b", re.I), "star"),
    # Comet designations: C/2023 A3, P/2010 T2, 1P, 67P, 2I/Borisov
    (re.compile(r"^[cpx]/\d{4}\s", re.I), "comet"),
    (re.compile(r"^\d{1,3}[pi](\b|/)", re.I), "comet"),
    # Exoplanet suffix: any designation ending in " b".." h" (HD 209458 b, Kepler-22b)
    (re.compile(r"^(kepler|k2|trappist|toi|hat-p|wasp|corot|gj|gliese|hd|55 cnc|proxima)[\s-].*[b-h]$", re.I), "planet"),
    (re.compile(r"^(kepler|k2|toi|hat-p|wasp|corot)-\d+", re.I), "planet"),
    # Star catalogs: HD 209458, HIP 65474, HR 7001, Gliese 581, Wolf 359, Ross 128
    (re.compile(r"^(hd|hip|hr|gliese|gj|wolf|ross|lacaille|luyten|bd)[\s+-]?\d", re.I), "star"),
    # Provisional minor-planet designations: 2020 QG, 1998 OR2; numbered: (99942)
    (re.compile(r"^\(?\d{4,6}\)?\s?[a-z]{2}\d*$", re.I), "asteroid"),
    (re.compile(r"^\(\d+\)", re.I), "asteroid"),
    # Sagittarius A*, M87*
    (re.compile(r"\*$"), "black_hole"),
]

# Keyword heuristics — the safety net. Order matters: specific before generic.
_KEYWORD_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"black.?hole|singularity|event.?horizon|accretion|sagittarius.?a|sgr.?a|ton\s?618|quasar|blazar", re.I), "black_hole"),
    (re.compile(r"nebula|supernova remnant|pillars of creation|molecular cloud|h\s?ii region", re.I), "nebula"),
    (re.compile(r"galax|milky.?way|andromeda|triangulum|magellanic|sombrero|whirlpool|local group|deep field", re.I), "galaxy"),
    (re.compile(r"comet|oort cloud|hale.?bopp|churyumov|oumuamua|borisov", re.I), "comet"),
    (re.compile(r"asteroid|meteor|near.?earth object|kuiper|trojan|minor planet|bennu|ryugu|itokawa|vesta|pallas|hygiea|psyche|\beros\b", re.I), "asteroid"),
    (re.compile(r"\bmoon\b|\bluna\b|natural satellite|europa|titan\b|ganymede|callisto|\bio\b|enceladus|triton|phobos|deimos|charon|miranda|mimas|iapetus|rhea\b|dione|tethys", re.I), "moon"),
    (re.compile(r"\bstar\b|stellar|\bsun\b|red (dwarf|giant)|white dwarf|brown dwarf|neutron star|pulsar|magnetar|(super|hyper)giant|sirius|betelgeuse|rigel|vega|polaris|proxima|centauri|antares|aldebaran|arcturus|canopus|deneb", re.I), "star"),
    (re.compile(r"exoplanet|planet|kepler|trappist|\bearth\b|\bmars\b|venus|jupiter|saturn|uranus|neptune|mercury\b|pluto|eris\b|haumea|makemake", re.I), "planet"),
]

# Bodies that scientifically are planets but render with a particle ring.
_RINGED = re.compile(r"saturn|uranus", re.I)


class Classification(TypedDict):
    query: str
    object_type: Optional[str]
    scene_type: Optional[str]
    matched_name: Optional[str]
    subtype: Optional[str]
    confidence: str
    method: str


def _scene_type(object_type: Optional[str], name: str, data: Optional[dict]) -> Optional[str]:
    if object_type != "planet":
        return object_type
    if data and data.get("rings"):
        return "ringed_planet"
    if _RINGED.search(name):
        return "ringed_planet"
    return "planet"


def _db_lookup(q: str) -> tuple[Optional[str], Optional[str], Optional[dict]]:
    """Exact, then substring match against the curated local database."""
    for category, objects in CELESTIAL_DATABASE.items():
        if q in objects:
            return _CATEGORY_TYPE.get(category), q, objects[q]
    for category, objects in CELESTIAL_DATABASE.items():
        for name, data in objects.items():
            if q == name or (len(q) > 3 and (q in name or name in q)):
                return _CATEGORY_TYPE.get(category), name, data
    return None, None, None


def classify(query: str) -> Classification:
    """Recognize a celestial body from free text. Never raises."""
    raw = (query or "").strip()
    q = re.sub(r"\s+", " ", raw.lower()).strip(" ?!.")

    # Strip common question scaffolding so "tell me about europa" still hits the DB
    stripped = re.sub(
        r"^(tell me about|what is|what's|who discovered|explain|describe|show me|info on|facts about|about)\s+",
        "", q,
    ).strip()
    candidates = [stripped, q] if stripped != q else [q]

    for cand in candidates:
        obj_type, name, data = _db_lookup(cand)
        if obj_type:
            return Classification(
                query=raw, object_type=obj_type,
                scene_type=_scene_type(obj_type, name or "", data),
                matched_name=(name or cand).title(),
                subtype=(data or {}).get("subtype"),
                confidence="high", method="database",
            )

    for cand in candidates:
        hit = _CATALOG_OBJECTS.get(re.sub(r"\s+", " ", cand))
        if hit:
            return Classification(
                query=raw, object_type=hit[0],
                scene_type=_scene_type(hit[0], hit[1], None),
                matched_name=hit[1], subtype=None,
                confidence="high", method="catalog",
            )

    for cand in candidates:
        for pattern, obj_type in _DESIGNATION_RULES:
            if pattern.search(cand):
                return Classification(
                    query=raw, object_type=obj_type,
                    scene_type=_scene_type(obj_type, cand, None),
                    matched_name=raw.title() if len(raw) < 40 else None,
                    subtype=None, confidence="medium", method="designation",
                )

    for pattern, obj_type in _KEYWORD_RULES:
        if pattern.search(q):
            return Classification(
                query=raw, object_type=obj_type,
                scene_type=_scene_type(obj_type, q, None),
                matched_name=None, subtype=None,
                confidence="low", method="keyword",
            )

    return Classification(
        query=raw, object_type=None, scene_type=None,
        matched_name=None, subtype=None,
        confidence="none", method="none",
    )
