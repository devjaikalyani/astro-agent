"""
Persistent memory for ASTRO.

Two layers:
  1. ChromaDB  — semantic vector store of past tool results (auto-populated)
  2. SQLite    — curated facts the agent explicitly chooses to remember
"""

import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

_STORE_DIR = Path(__file__).parent / "memory_store"
_STORE_DIR.mkdir(exist_ok=True)

_SQLITE_PATH = _STORE_DIR / "facts.db"
_CHROMA_PATH = str(_STORE_DIR / "chroma")

_MEMORY_TOOLS = {"remember_fact", "recall_facts"}


class MemoryStore:
    """Singleton — one shared store for the process lifetime."""

    _instance: "MemoryStore | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "MemoryStore":
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
        # ChromaDB — semantic search over past tool results
        client = chromadb.PersistentClient(path=_CHROMA_PATH)
        self._collection = client.get_or_create_collection(
            name="astro_memory",
            embedding_function=DefaultEmbeddingFunction(),
            metadata={"hnsw:space": "cosine"},
        )
        # SQLite — agent-curated facts
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

    # ── Write ─────────────────────────────────────────────────────────────────

    def store_tool_result(self, query: str, tool_name: str, result: dict) -> None:
        """Auto-called after each live tool result. Never raises."""
        try:
            self._init()
            doc = (
                f"Query: {query}\n"
                f"Tool: {tool_name}\n"
                f"Result: {json.dumps(result, indent=2, default=str)[:1200]}"
            )
            uid = hashlib.sha256(f"{tool_name}:{query}:{json.dumps(result, default=str)[:80]}".encode()).hexdigest()[:24]
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

    # ── Read ──────────────────────────────────────────────────────────────────

    def recall(self, query: str, n_vectors: int = 4, n_facts: int = 8) -> str:
        """
        Retrieve relevant memories for a query.
        Returns a formatted string (empty string if nothing found).
        """
        try:
            self._init()
        except Exception:
            return ""

        sections: list[str] = []

        # 1. Semantic search over past tool results
        try:
            count = self._collection.count()
            if count > 0:
                res = self._collection.query(
                    query_texts=[query],
                    n_results=min(n_vectors, count),
                )
                docs = (res.get("documents") or [[]])[0]
                if docs:
                    block = "\n---\n".join(docs)
                    sections.append(f"### Past tool discoveries (semantic match)\n{block}")
        except Exception:
            pass

        # 2. Keyword search over curated facts
        try:
            keywords = [w for w in query.lower().split() if len(w) > 3]
            if keywords:
                like_parts = " OR ".join("lower(fact) LIKE ?" for _ in keywords)
                params: list = [f"%{k}%" for k in keywords]
                with self._db_lock:
                    rows = self._db.execute(
                        f"SELECT id, fact, source, confidence FROM facts "
                        f"WHERE {like_parts} "
                        f"ORDER BY confidence DESC, access_count DESC LIMIT ?",
                        params + [n_facts],
                    ).fetchall()
                    if rows:
                        ids = [r[0] for r in rows]
                        placeholders = ",".join("?" for _ in ids)
                        self._db.execute(
                            f"UPDATE facts SET access_count = access_count + 1 "
                            f"WHERE id IN ({placeholders})",
                            ids,
                        )
                        self._db.commit()
                if rows:
                    lines = [f"- {r[1]}  (source: {r[2]}, confidence: {r[3]:.1f})" for r in rows]
                    sections.append("### Remembered facts\n" + "\n".join(lines))
        except Exception:
            pass

        if not sections:
            return ""

        header = "## ASTRO Memory — relevant to this query\n"
        return header + "\n\n".join(sections)

    def recall_tool(self, query: str) -> str:
        """Called via the recall_facts tool — returns JSON."""
        result = self.recall(query)
        if result:
            return json.dumps({"memories": result})
        return json.dumps({"memories": "No relevant memories found yet."})


memory = MemoryStore()
