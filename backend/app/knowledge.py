"""
The agent's permanent knowledge.

Two layers, both persisted under backend/memory_store (survives rebuilds):
  1. ChromaDB  — semantic vector store of live tool discoveries (auto)
  2. SQLite    — facts the agent explicitly chooses to remember

Also shapes the knowledge for the Observatory page: every fact becomes a
star in a 3D constellation, deterministically positioned so the sky is
stable between visits and only ever grows.
"""

import hashlib
import json
import math
import sqlite3
import threading
from datetime import datetime, timezone

import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

from app.config import STORE_DIR

STORE_DIR.mkdir(exist_ok=True)
_SQLITE_PATH = STORE_DIR / "facts.db"
_CHROMA_PATH = str(STORE_DIR / "chroma")


class Knowledge:
    """Singleton — one shared store for the process lifetime."""

    _instance: "Knowledge | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "Knowledge":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._ready = False
                    cls._instance = inst
        return cls._instance

    def _init(self) -> None:
        if self._ready:
            return
        client = chromadb.PersistentClient(path=_CHROMA_PATH)
        self._collection = client.get_or_create_collection(
            name="astro_memory",
            embedding_function=DefaultEmbeddingFunction(),
            metadata={"hnsw:space": "cosine"},
        )
        self._db = sqlite3.connect(str(_SQLITE_PATH), check_same_thread=False)
        self._db_lock = threading.Lock()
        self._db.execute("""
            CREATE TABLE IF NOT EXISTS facts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                fact         TEXT    NOT NULL,
                source       TEXT    DEFAULT 'agent',
                confidence   REAL    DEFAULT 1.0,
                related_query TEXT   DEFAULT '',
                created_at   TEXT    DEFAULT (datetime('now')),
                access_count INTEGER DEFAULT 0
            )
        """)
        self._db.commit()
        self._ready = True

    # ── Write ────────────────────────────────────────────────────────────────

    def index_discovery(self, query: str, tool_name: str, result: dict) -> None:
        """Auto-called after each live tool result. Never raises."""
        try:
            self._init()
            doc = (
                f"Query: {query}\n"
                f"Tool: {tool_name}\n"
                f"Result: {json.dumps(result, indent=2, default=str)[:1200]}"
            )
            uid = hashlib.sha256(
                f"{tool_name}:{query}:{json.dumps(result, default=str)[:80]}".encode()
            ).hexdigest()[:24]
            self._collection.upsert(
                documents=[doc],
                ids=[uid],
                metadatas=[{
                    "query":       query[:200],
                    "tool":        tool_name,
                    "object_name": str(result.get("name") or result.get("matched_name") or ""),
                    "object_type": str(result.get("type") or result.get("object_type") or ""),
                    "ts":          datetime.now(timezone.utc).isoformat(),
                }],
            )
        except Exception:
            pass

    def store_fact(self, fact: str, source: str = "agent", confidence: float = 1.0, query: str = "") -> str:
        """Agent calls this explicitly via the remember_fact tool."""
        try:
            self._init()
            with self._db_lock:
                self._db.execute(
                    "INSERT INTO facts (fact, source, confidence, related_query) VALUES (?, ?, ?, ?)",
                    (fact.strip(), source.strip(), max(0.0, min(1.0, confidence)), query),
                )
                self._db.commit()
            return json.dumps({"stored": True, "fact": fact[:120]})
        except Exception as e:
            return json.dumps({"stored": False, "error": str(e)})

    # ── Read ─────────────────────────────────────────────────────────────────

    def recall(self, query: str, n_vectors: int = 3, n_facts: int = 6) -> str:
        """Format relevant memories for prompt injection ('' if none)."""
        try:
            self._init()
        except Exception:
            return ""

        sections: list[str] = []
        try:
            count = self._collection.count()
            if count > 0:
                res = self._collection.query(query_texts=[query], n_results=min(n_vectors, count))
                docs = (res.get("documents") or [[]])[0]
                if docs:
                    # Trimmed so injected context stays inside free-tier budgets
                    block = "\n---\n".join(d[:700] for d in docs)
                    sections.append(f"### Past tool discoveries (semantic match)\n{block}")
        except Exception:
            pass

        try:
            keywords = [w for w in query.lower().split() if len(w) > 3]
            if keywords:
                like_parts = " OR ".join("lower(fact) LIKE ?" for _ in keywords)
                params: list = [f"%{k}%" for k in keywords]
                with self._db_lock:
                    rows = self._db.execute(
                        f"SELECT id, fact, source, confidence FROM facts "
                        f"WHERE {like_parts} ORDER BY confidence DESC, access_count DESC LIMIT ?",
                        params + [n_facts],
                    ).fetchall()
                    if rows:
                        ids = [r[0] for r in rows]
                        ph = ",".join("?" for _ in ids)
                        self._db.execute(
                            f"UPDATE facts SET access_count = access_count + 1 WHERE id IN ({ph})", ids
                        )
                        self._db.commit()
                if rows:
                    lines = [f"- {r[1]}  (source: {r[2]}, confidence: {r[3]:.1f})" for r in rows]
                    sections.append("### Remembered facts\n" + "\n".join(lines))
        except Exception:
            pass

        if not sections:
            return ""
        return "## ASTRO Memory — relevant to this query\n" + "\n\n".join(sections)

    def recall_tool(self, query: str) -> str:
        result = self.recall(query)
        if result:
            return json.dumps({"memories": result})
        return json.dumps({"memories": "No relevant memories found yet."})

    # ── Observatory (constellation + stats) ──────────────────────────────────

    def stats(self) -> dict:
        out = {"facts": 0, "discoveries": 0, "last_learned_at": None}
        try:
            self._init()
        except Exception:
            return out
        try:
            with self._db_lock:
                row = self._db.execute("SELECT COUNT(*), MAX(created_at) FROM facts").fetchone()
            out["facts"] = row[0] or 0
            out["last_learned_at"] = row[1]
        except Exception:
            pass
        try:
            out["discoveries"] = self._collection.count()
        except Exception:
            pass
        return out

    def constellation(self, limit: int = 400) -> dict:
        """Every fact as a star: deterministic position on a unit sphere from
        the fact's hash, so the sky is stable and only grows."""
        try:
            self._init()
            with self._db_lock:
                rows = self._db.execute(
                    "SELECT id, fact, source, confidence, created_at, access_count "
                    "FROM facts ORDER BY id DESC LIMIT ?",
                    (max(1, min(1000, limit)),),
                ).fetchall()
        except Exception:
            rows = []

        stars = []
        for r in rows:
            h = int(hashlib.sha256(str(r[1]).encode()).hexdigest()[:12], 16)
            theta = (h % 62832) / 10000.0                 # 0..2pi
            phi = math.acos(2 * (((h >> 16) % 10000) / 10000.0) - 1)
            radius = 0.72 + (((h >> 32) % 1000) / 1000.0) * 0.28
            stars.append({
                "id": r[0],
                "fact": r[1],
                "source": r[2],
                "confidence": r[3],
                "created_at": r[4],
                "access_count": r[5],
                "pos": [
                    round(radius * math.sin(phi) * math.cos(theta), 4),
                    round(radius * math.cos(phi) * 0.62, 4),
                    round(radius * math.sin(phi) * math.sin(theta), 4),
                ],
            })

        return {"stats": self.stats(), "stars": stars}


knowledge = Knowledge()
