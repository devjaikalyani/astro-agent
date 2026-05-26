# ASTRO — Celestial Intelligence

An AI-powered astronomical research tool. Ask about any planet, star, nebula, black hole, galaxy, comet, moon, or asteroid in the universe and get a streaming deep-space analysis backed by live databases (SIMBAD, NASA Exoplanet Archive, JPL Horizons) and real NASA imagery.

## Features

- Real-time SSE streaming responses
- Multi-model support: Llama 3.3 70B / Llama 3.1 8B / Gemma 2 9B via Groq, and Claude Sonnet via Anthropic
- Live astronomical data from SIMBAD, NASA Exoplanet Archive, and JPL Horizons
- Real NASA imagery pulled from the NASA Image and Video Library
- Immersive Three.js 3D scene per object type with UnrealBloom postprocessing
- Milky Way band, spectral-class star colours, and nebula clouds on the home page

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | Next.js 15, Three.js, Tailwind CSS, React Markdown |
| Backend  | FastAPI, Groq SDK, Anthropic SDK, SlowAPI          |
| AI       | Llama 3.3 70B (Groq), Claude Sonnet (Anthropic)   |

## Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- A [Groq API key](https://console.groq.com/keys)
- An [Anthropic API key](https://console.anthropic.com/settings/keys) (only needed for Claude model)

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
│   ├── tools.py         # Astronomical tool definitions + live API calls
│   └── data.py          # Local celestial body database
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # Home page
│   │   └── explore/[query]/page.tsx  # Explore page (SSE consumer + NASA imagery)
│   ├── components/
│   │   ├── SpaceBackground.tsx  # Home page Three.js scene
│   │   ├── ExploreScene.tsx     # Explore page Three.js scene
│   │   ├── AstroSearch.tsx      # Search input
│   │   └── ModelSelector.tsx    # Model picker
│   └── lib/
│       └── types.ts             # Shared TypeScript types
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
data: {"type": "status", "message": "Connecting..."}
data: {"type": "tool_call", "name": "classify_celestial_body", "input": {...}}
data: {"type": "tool_result", "name": "classify_celestial_body", "object_type": "moon", "object_name": "Europa"}
data: {"type": "text_delta", "text": "### Europa — Jovian Moon\n\n"}
data: {"type": "done"}
```

### `GET /health`

```json
{ "status": "online", "agent": "ASTRO" }
```
