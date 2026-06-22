# ASTRO — Celestial Intelligence

An AI-powered astronomical research tool. Ask about any planet, star, nebula, black hole, galaxy, comet, moon, or asteroid in the universe and get a streaming deep-space analysis backed by live databases (SIMBAD, NASA Exoplanet Archive, JPL Horizons) — rendered inside a cinematic, fully 3D environment where every object type is reimagined as a true volumetric Three.js scene.

## Features

- Real-time SSE streaming responses
- Multi-model support: Llama 3.3 70B / Llama 3.1 8B / Gemma 2 9B via Groq, and Claude Sonnet via Anthropic
- Live astronomical data from SIMBAD, NASA Exoplanet Archive, and JPL Horizons
- Peer-reviewed research surfaced live from NASA ADS
- Persistent memory: ChromaDB vector store of past tool discoveries + SQLite curated facts
- Cinematic deep-space UI: glass HUD overlays, live telemetry, oversized type, ambient camera drift and pointer parallax
- Fully volumetric 3D for every object type — procedural GLSL surfaces (planets, gas giants, stars) and particle systems (nebulae, galaxies, comet tails, black-hole accretion disks), all with UnrealBloom postprocessing. No flat images.
- Home hero scene: a procedurally-shaded gas giant with a particle ring, a Milky Way band, drifting nebula volumes, and spectral-class parallax starfields

## Stack

| Layer    | Tech                                                                   |
|----------|------------------------------------------------------------------------|
| Frontend | Next.js 15.5, Three.js 0.184 + custom GLSL shaders, Tailwind CSS 4, TypeScript |
| Backend  | FastAPI, Groq SDK 1.4, Anthropic SDK, SlowAPI                          |
| Memory   | ChromaDB (semantic search) + SQLite (curated facts)                    |
| AI       | Llama 3.3 70B (Groq), Claude Sonnet 4.6 (Anthropic)                    |

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- A [Groq API key](https://console.groq.com/keys)
- An [Anthropic API key](https://console.anthropic.com/settings/keys) (only needed for Claude model)
- An [NASA ADS API key](https://ui.adsabs.harvard.edu/user/settings/token) (free — for research paper search)

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
│   ├── main.py          # FastAPI app, routing, rate limiting
│   ├── agent.py         # Groq agentic loop (Llama / Gemma)
│   ├── agent_claude.py  # Anthropic agentic loop (Claude)
│   ├── memory.py        # Persistent memory: ChromaDB + SQLite
│   ├── tools.py         # Astronomical tool definitions + live API calls
│   └── data.py          # Local celestial body database
├── frontend/
│   ├── app/
│   │   ├── globals.css               # Cinematic design system (glass, HUD, motion)
│   │   ├── layout.tsx                # Fonts (Space Grotesk / Outfit / JetBrains Mono)
│   │   ├── page.tsx                  # Home page — HUD over the hero 3D scene
│   │   └── explore/[query]/page.tsx  # Explore page (SSE consumer + 3D + analysis drawer)
│   ├── components/
│   │   ├── SpaceBackground.tsx  # Home hero: gas giant + ring + nebulae + starfields
│   │   ├── ExploreScene.tsx     # Volumetric scene per object type
│   │   ├── AstroSearch.tsx      # Glass command bar + suggestions
│   │   └── ModelSelector.tsx    # Model picker
│   └── lib/
│       ├── types.ts             # Shared TypeScript types
│       ├── glsl.ts              # Shared GLSL: simplex noise, fbm, body/atmosphere shaders
│       └── three-utils.ts       # Renderer, bloom composer, starfields, disposal helpers
├── .env.example
└── package.json         # Root scripts (concurrently)
```

## API

### `POST /api/ask`

Rate limited: 10 requests/minute, 100/day.

**Request**
```json
{ "query": "Tell me about Europa", "model": "llama-3.3-70b-versatile" }
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
data: {"type": "status",      "message": "Connecting..."}
data: {"type": "tool_call",   "name": "classify_celestial_body", "input": {...}}
data: {"type": "tool_result", "name": "classify_celestial_body", "object_type": "moon", "object_name": "Europa"}
data: {"type": "text_delta",  "text": "### Europa — Jovian Moon\n\n"}
data: {"type": "error",       "message": "Connection interrupted. Partial response shown."}
data: {"type": "done"}
```

### `GET /health`

```json
{ "status": "online", "agent": "ASTRO" }
```
