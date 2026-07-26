# ASTRO: A Universe That Learns

An autonomous astronomical intelligence living inside a navigable 3D universe. The website is not a page with a search box: it opens inside a real-time HD solar system. Fly between worlds, click any body to wake the agent, warp to deep fields for anything beyond the system, ride agent-narrated voyages, and watch everything the agent learns accumulate as a growing constellation.

## The three experiences

### 1. The Universe (`/`)
A real-time HD solar system with 34 navigable worlds on true Keplerian orbits (real inclinations, eccentricities and axial tilts):

- The Sun with an animated 4K surface, churning granulation and a breathing corona that fades as you fly close.
- Eight planets in 4K, lit by custom shaders: soft day/night terminators, limb darkening, a warm band of twilight. Earth gets real city lights on its night side, cloud cover and ocean sun-glint. Saturn's rings receive the planet's cast shadow. Uranus rolls on its side, moons and rings following its true obliquity.
- Five dwarf planets: Ceres inside the belt, Pluto (procedural nitrogen-ice surface) with Charon, egg-shaped fast-tumbling Haumea, Makemake, and Eris on its 44-degree scattered-disc orbit.
- Eighteen moons, from textured Galileans to irregular rock-pile Phobos and Deimos and retrograde Triton.
- Two periodic comets, 1P/Halley and Hale-Bopp, diving through the inner system on eccentric inclined orbits, growing anti-sunward ion and dust tails as they approach perihelion.
- The asteroid belt, the Kuiper belt, and a 4K Milky Way sky under round spectrally-colored stars, finished with cinematic grain and vignette.

Drag to orbit, scroll to zoom, click any world for a cinematic day-side approach. A time instrument pauses or accelerates the system (1x / 8x / 32x) with a running sim-year clock, and `/?focus=<body>` deep-links straight to any world. Every body has an instrument card and an ENGAGE ASTRO button that opens the agent dock. Search anything else in the universe (Cmd+K): Betelgeuse, M31, Sagittarius A*, TRAPPIST-1e, and the camera warps to a procedurally generated volumetric deep field while the agent streams its analysis.

### 2. Journeys (`/journeys`)
A departure hall. The library is a timetable of scheduled voyages over a live 3D platform scene: a low sun on the ecliptic, worlds strung out toward the ice line, drifting dust, pointer parallax. ASTRO composes the route, writes the narration, and flies the camera stop by stop: in-system flights for solar bodies, warps for deep-space objects. The Grand Tour is hand-crafted and launches instantly; every other theme, preset or typed, is composed live by the model as structured JSON. The player is a letterboxed cinematic: each stop opens with a full-screen name reveal that settles into a floating lower-third narration. Keyboard: arrows navigate, A toggles auto-advance, S skips typing, Esc exits.

### 3. The Observatory (`/observatory`)
The agent's memory as a living sky. Every fact ASTRO has chosen to remember is a twinkling star, deterministically positioned, colored by data source, clustered under soft nebula haze, connected to its nearest kin. Hover to read, click to pin a full detail card with a confidence meter. Filter the sky by source from the instrument rail, or press R to replay the sky: the constellation rebuilds star by star, in the order each fact was learned. The sky only ever grows.

## The agent

- **Recognition engine**: deterministic classification before any model call: curated database (200+ bodies), Messier/NGC catalog table, designation patterns (HD, PSR, `C/2023 A3`, `2020 QG`), keyword heuristics. All 34 solar-system bodies route to in-system camera flights; everything else warps to a deep field.
- **Autonomous tool loop**: one orchestrator for every model (Groq Llama/Gemma + Anthropic Claude behind one provider interface). The agent decides which live databases to interrogate: SIMBAD, NASA Exoplanet Archive, JPL Horizons, NASA ADS (peer-reviewed papers), Minor Planet Center.
- **Compounding memory**: live discoveries auto-indexed in a ChromaDB vector store; the agent curates precise facts into SQLite via its own `remember_fact` tool. Both are recalled on future queries and rendered in the Observatory.
- **Visible cognition**: the mission feed streams every recognition, tool call, and memory write into the dock as it happens.
- **Conversation**: follow-ups keep full context without repeating the dossier.

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 15.5, Three.js 0.184 (custom engine + GLSL), Tailwind CSS 4, Framer Motion, TypeScript |
| Backend  | FastAPI, Groq SDK, Anthropic SDK, SlowAPI |
| Memory   | ChromaDB (semantic) + SQLite (curated facts) |
| Textures | Solar System Scope (CC BY 4.0, 8K masters at 4K) + NASA-derived moon maps |
| Type     | Unbounded / Sora / Newsreader / IBM Plex Mono |

## Setup

Prerequisites: Node 20+, Python 3.11+, a [Groq key](https://console.groq.com/keys) (free), optionally an [Anthropic key](https://console.anthropic.com/settings/keys) and a [NASA ADS key](https://ui.adsabs.harvard.edu/user/settings/token).

```bash
cp .env.example .env        # add your keys

cd backend && pip install -r requirements.txt && cd ..
npm install
npm --prefix frontend install

npm start                   # backend :8000 + frontend :3000
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
backend/
  main.py                 # uvicorn entry shim -> app.main
  app/
    main.py               # API: /api/agent/stream, /api/recognize,
                          #      /api/knowledge, /api/journeys(+/presets)
    agent.py              # the agentic loop (SSE protocol v3)
    providers.py          # Groq + Claude adapters, one interface
    recognition.py        # deterministic recognition engine
    journeys.py           # journey composer + hand-crafted Grand Tour
    knowledge.py          # ChromaDB + SQLite + constellation shaping
    toolkit.py            # tool schemas + dispatcher
    live_data.py          # SIMBAD / Exoplanet Archive / JPL / ADS / MPC
    prompts.py            # agent identity + journey composer prompt
    celestial_db.py       # curated local dataset (200+ bodies)
    config.py, events.py
frontend/
  app/
    page.tsx              # The Universe
    journeys/page.tsx     # Departure hall
    journeys/play/page.tsx# Letterboxed narrated player
    observatory/page.tsx  # Knowledge constellation + instrument rail
  components/             # TopNav, AgentDock, CommandPalette,
                          # useAgentSession, useModel
  lib/
    api.ts                # SSE v3 client + endpoints
    universe-data.ts      # orbital dataset (planets, dwarfs, moons,
                          # comets) + focus cards
    engine/
      universe.ts         # Kepler solar system, camera flights, comets,
                          # time control, picking, warp
      deep.ts             # procedural deep-field builders (9 classes)
      constellation.ts    # observatory sky: twinkle shader, replay,
                          # filtering, pinning
      backdrop.ts         # journeys departure-platform scene
      core.ts, shaders.ts # renderer, bloom + finish pass, starfields,
                          # sky sphere, surface/sun/ring/cloud GLSL
  public/textures/        # 4K equirectangular maps + CREDITS.txt
```

## API

### `POST /api/agent/stream` (SSE protocol v3)

```json
{ "query": "Europa", "model": "llama-3.3-70b-versatile", "history": [] }
```

```
data: {"e":"recognition", "body":{"object_type":"moon","scene":"moon","name":"Europa","solar_body":"europa", ...}}
data: {"e":"phase",      "label":"Linking observatory network"}
data: {"e":"recalled",   "detail":"Prior discoveries loaded from memory"}
data: {"e":"tool",       "id":"a1b2c3d4","name":"search_live_astronomy","label":"Querying live sky databases","source":"SIMBAD/EXO/JPL"}
data: {"e":"tool_done",  "id":"a1b2c3d4","summary":"SIMBAD CDS, JPL Horizons","body":{...}}
data: {"e":"learned",    "fact":"Europa's ice shell is estimated at 15-25 km thick..."}
data: {"e":"delta",      "t":"### Europa, Jovian Moon\n\n"}
data: {"e":"fault",      "message":"..."}
data: {"e":"complete"}
```

Models: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gemma2-9b-it` (Groq), `claude-sonnet-4-6` (Anthropic). Rate limited 10/min, 150/day.

### `POST /api/journeys`

`{ "theme": "volcanic worlds", "model": "..." }` -> `{ title, subtitle, stops: [{ name, kind: "solar"|"deep", type, headline, narration }] }`. Theme `grand-tour` returns the hand-crafted flagship instantly.

### `GET /api/journeys/presets` · `GET /api/recognize?q=` · `GET /api/knowledge?limit=`

Presets list · instant recognition · memory stats + every learned fact as a positioned star.

### `GET /health`
