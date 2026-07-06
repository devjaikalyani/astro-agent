"""Live observatory-network calls: SIMBAD, NASA Exoplanet Archive,
JPL Horizons, NASA ADS, Minor Planet Center."""

import re
from typing import Optional

import requests

from app.config import ads_key

_SIMBAD_TAP    = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
_EXOPLANET_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
_HORIZONS_API  = "https://horizons.jpl.nasa.gov/api/v1/"
_ADS_API       = "https://api.adsabs.harvard.edu/v1/search/query"
_MPC_API       = "https://minorplanetcenter.net"


def _simbad_query(adql: str) -> Optional[dict]:
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
    """SIMBAD + NASA Exoplanet Archive + JPL Horizons, merged."""
    safe = query.replace("'", "''").strip()
    result = {"query": query, "found": False, "sources": []}

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

    try:
        exo_query = (
            "SELECT TOP 5 pl_name, pl_orbper, pl_rade, pl_bmasse, pl_eqt, "
            "pl_orbsmax, sy_dist, hostname, disc_year, discoverymethod "
            f"FROM ps WHERE LOWER(pl_name) LIKE LOWER('%{safe}%')"
        )
        r = requests.get(_EXOPLANET_TAP, params={"query": exo_query, "format": "json"}, timeout=8)
        if r.ok and r.text.strip():
            rows = r.json()
            if rows:
                result["exoplanet_archive"] = rows[:3]
                result["found"] = True
                result["sources"].append("NASA Exoplanet Archive")
    except Exception:
        pass

    try:
        r = requests.get(
            _HORIZONS_API,
            params={"format": "json", "COMMAND": f"'{safe}'", "MAKE_EPHEM": "NO", "OBJECT_DATA": "YES"},
            timeout=8,
        )
        if r.ok:
            jpl = r.json()
            if jpl.get("result") and "No matches" not in jpl["result"]:
                result["jpl_horizons"] = {"raw_summary": jpl["result"][:800]}
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
    """Peer-reviewed literature via the NASA Astrophysics Data System."""
    token = ads_key()
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
                    "found": True,
                    "source": "NASA ADS",
                    "count": len(docs),
                    "papers": [
                        {
                            "title":     (d.get("title") or [""])[0],
                            "authors":   (d.get("author") or [])[:3],
                            "year":      d.get("year"),
                            "journal":   d.get("pub", ""),
                            "citations": d.get("citation_count", 0),
                            "abstract":  (d.get("abstract") or "")[:400],
                            "bibcode":   d.get("bibcode", ""),
                        }
                        for d in docs
                    ],
                }
    except Exception:
        pass
    return {"found": False, "source": "NASA ADS", "query": query}


def search_mpc(query: str) -> dict:
    """Minor Planet Center: asteroid and comet orbital data."""
    safe = query.strip()
    result: dict = {"query": safe, "found": False, "source": "Minor Planet Center"}

    try:
        r = requests.get(f"{_MPC_API}/api/objects/{requests.utils.quote(safe)}/", timeout=8)
        if r.ok and r.headers.get("content-type", "").startswith("application/json"):
            data = r.json()
            if data:
                result.update({"found": True, **data})
                return result
    except Exception:
        pass

    try:
        r = requests.get(f"{_MPC_API}/cgi-bin/showobsorbs.cgi", params={"Obj": safe, "orb": "y"}, timeout=8)
        if r.ok:
            clean = re.sub(r"<[^>]+>", "", r.text).strip()
            useful = [l.strip() for l in clean.splitlines() if l.strip() and len(l.strip()) > 4]
            if len(useful) > 3:
                result.update({"found": True, "orbital_data": "\n".join(useful[:20])})
                return result
    except Exception:
        pass

    try:
        r = requests.get(f"{_MPC_API}/cgi-bin/returnprepeph.cgi", params={"d": safe, "t": "c"}, timeout=8)
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
