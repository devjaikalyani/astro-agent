# ASTRO — Agentic Celestial Intelligence

An autonomous AI agent that recognizes any natural celestial body, interrogates live observatory networks, and permanently learns from every discovery it makes. Ask about any planet, star, nebula, black hole, galaxy, comet, moon, or asteroid — ASTRO recognizes it instantly, runs an agentic tool loop against real astronomical databases (SIMBAD, NASA Exoplanet Archive, JPL Horizons, NASA ADS, Minor Planet Center), and streams a deep-space analysis inside a cinematic, fully 3D environment.

## What makes it an agent

- **Recognition engine** — a deterministic classifier identifies the object before any model call: local database (200+ curated bodies), famous catalog table (Messier/NGC), designation patterns (HD, PSR, Kepler-, C/2023 A3, provisional minor-planet IDs), and keyword heuristics. The 3D scene locks on within milliseconds.
- **Autonomous tool loop** — one orchestrator drives every model. The agent decides which live databases to query, reads the results, and keeps digging until it has enough to answer (hard-capped rounds).
- **Compounding memory** — every live discovery is auto-indexed in a ChromaDB vector store; the agent also curates precise facts into SQLite via its own `remember_fact` tool. Both are recalled on future queries. The more you ask, the smarter it gets.
- **Visible cognition** — the Mission Log streams every recognition, tool call, and memory write to the UI in real time. You watch the agent think.
- **Conversation** — follow-up questions keep full context; the agent answers conversationally without repeating the full dossier.

## Features

- Real-time SSE streaming with a rich event protocol (`classified`, `tool_call`, `tool_result`, `memory`, `text_delta`)
- Multi-model: Llama 3.3 70B / Llama 3.1 8B / Gemma 2 9B via Groq, Claude Sonnet via Anthropic — one shared agent loop
- Live astronomical data from SIMBAD, NASA Exoplanet Archive, JPL Horizons, and the Minor Planet Center
- Peer-reviewed research surfaced live from NASA ADS
- Knowledge stats on the home page: facts learned and discoveries indexed, straight from the agent's memory
- Cinematic deep-space UI: glass HUD, live telemetry, mission log, persistent analysis panel with follow-up composer
- Fully volumetric 3D for every object type — procedural GLSL surfaces (planets, gas giants, stars) and particle systems (nebulae, galaxies, comet tails, black-hole accretion disks) with UnrealBloom postprocessing. No flat images.

## Stack

| Layer    | Tech                                                                   |
|----------|------------------------------------------------------------------------|
| Frontend | Next.js 15.5, Three.js 0.184 + custom GLSL shaders, Tailwind CSS 4, TypeScript |
| Backend  | FastAPI, Groq SDK, Anthropic SDK, SlowAPI                              |
| Memory   | ChromaDB (semantic search) + SQLite (curated facts)                    |
| AI       | Llama 3.3 70B (Groq), Claude Sonnet 4.6 (Anthropic)                    |

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- A [Groq API key](https://console.groq.com/keys)
- An [Anthropic API key](https://console.anthropic.com/settings/keys) (only needed for Claude model)
- A [NASA ADS API key](https://ui.adsabs.harvard.edu/user/settings/token) (free — for research paper search)

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd astro-agent

cp .env.example .env
# Edit .env and add your API keys
```

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 3. Install frontend and root dependencies

```bash
npm install
npm --prefix frontend install
```

### 4. Run

```bash
npm start
```

This starts both the FastAPI backend (port 8000) and the Next.js frontend (port 3000) concurrently with hot-reload.

Open [http://localhost:3000](http://localhost:3000).

### Run separately

```bash
# Backend only
cd backend && uvicorn main:app --port 8000 --reload

# Frontend only
npm --prefix frontend run dev
```

## Project Structure

```
.
├── backend/
│   ├── main.py          # FastAPI app: /api/ask, /api/classify, /api/stats, /api/facts
│   ├── orchestrator.py  # The agentic loop — one pipeline for every model
│   ├── providers.py     # Groq + Anthropic adapters behind one interface
│   ├── classifier.py    # Recognition engine (DB + catalogs + designations + keywords)
│   ├── prompts.py       # Agent identity and behavior
│   ├── memory.py        # Persistent learning: ChromaDB + SQLite + stats
│   ├── tools.py         # Astronomical tool definitions + live API calls
│   └── data.py          # Local celestial body database
├── frontend/
│   ├── app/
│   │   ├── globals.css               # Cinematic design system (glass, HUD, motion)
│   │   ├── layout.tsx                # Fonts (Space Grotesk / Outfit / JetBrains Mono)
│   │   ├── page.tsx                  # Home — hero, knowledge stats, typed targets
│   │   └── explore/[query]/page.tsx  # Mission control: 3D + mission log + conversation
│   ├── components/
│   │   ├── SpaceBackground.tsx  # Home hero: gas giant + ring + nebulae + starfields
│   │   ├── ExploreScene.tsx     # Volumetric scene per object type
│   │   ├── MissionLog.tsx       # Live feed of the agent's tool calls and memory writes
│   │   ├── AnalysisPanel.tsx    # Streaming conversation + follow-up composer
│   │   ├── KnowledgeStats.tsx   # Facts learned / discoveries indexed
│   │   ├── AstroSearch.tsx      # Glass command bar + typed target chips
│   │   └── ModelSelector.tsx    # Model picker
│   └── lib/
│       ├── types.ts             # SSE protocol v2, chat + mission-log types
│       ├── glsl.ts              # Shared GLSL: simplex noise, fbm, body/atmosphere shaders
│       └── three-utils.ts       # Renderer, bloom composer, starfields, disposal helpers
├── .env.example
└── package.json         # Root scripts (concurrently)
```

## API

### `POST /api/ask`

Rate limited: 10 requests/minute, 100/day. Supports multi-turn conversation via `history`.

**Request**
```json
{
  "query": "How thick is the ice shell?",
  "model": "llama-3.3-70b-versatile",
  "history": [
    { "role": "user", "content": "Tell me about Europa" },
    { "role": "assistant", "content": "### Europa — Jovian Moon..." }
  ]
}
```

**Supported models**
| Model ID | Provider |
|---|---|
| `llama-3.3-70b-versatile` | Groq |
| `llama-3.1-8b-instant` | Groq |
| `gemma2-9b-it` | Groq |
| `claude-sonnet-4-6` | Anthropic |

**Response** — `text/event-stream` SSE

```
data: {"type": "classified",  "object_type": "moon", "scene_type": "moon", "object_name": "Europa", "confidence": "high", "method": "database"}
data: {"type": "status",      "message": "Linking observatory network"}
data: {"type": "memory",      "action": "recalled", "detail": "Prior discoveries loaded from memory"}
data: {"type": "tool_call",   "name": "search_live_astronomy", "input": {"query": "Europa"}}
data: {"type": "tool_result", "name": "search_live_astronomy", "object_type": "moon", "object_name": "Europa", "summary": "SIMBAD CDS, JPL Horizons"}
data: {"type": "memory",      "action": "stored", "detail": "Europa's ice shell is estimated at 15-25 km thick..."}
data: {"type": "text_delta",  "text": "### Europa — Jovian Moon\n\n"}
data: {"type": "error",       "message": "Connection interrupted. Partial response shown."}
data: {"type": "done"}
```

### `GET /api/classify?q=<query>`

Instant recognition without invoking the agent.

```json
{ "query": "M31", "object_type": "galaxy", "scene_type": "galaxy", "matched_name": "Andromeda Galaxy", "confidence": "high", "method": "catalog" }
```

### `GET /api/stats`

What the agent has learned so far.

```json
{ "facts": 42, "discoveries": 180, "last_learned_at": "2026-07-04 09:12:44" }
```

### `GET /api/facts?limit=8`

Most recently learned curated facts.

### `GET /health`

```json
{ "status": "online", "agent": "ASTRO", "version": "2.0.0" }
```
