// Shared types for the ASTRO frontend — SSE protocol v2, conversation
// turns, and mission-log entries.

export type SSEEvent =
  | {
      type: "classified";
      object_type: string | null;
      scene_type: string | null;
      object_name: string | null;
      confidence: string;
      method: string;
    }
  | { type: "status"; message: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      name: string;
      object_type?: string | null;
      scene_type?: string | null;
      object_name?: string | null;
      summary?: string;
    }
  | { type: "memory"; action: "stored" | "recalled"; detail: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ObjectType =
  | "planet"
  | "ringed_planet"
  | "star"
  | "moon"
  | "asteroid"
  | "comet"
  | "nebula"
  | "black_hole"
  | "galaxy"
  | null;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// One line in the live mission log — the agent's visible thought process.
export interface LogEntry {
  id: number;
  kind: "recognition" | "tool" | "memory" | "error";
  label: string;
  detail?: string;
  source?: string;
  state: "running" | "done";
}

export interface KnowledgeStats {
  facts: number;
  discoveries: number;
  last_learned_at: string | null;
}

// Tool metadata for the mission log: human label + data-source badge.
export const TOOL_META: Record<string, { label: string; source: string }> = {
  recall_facts: { label: "Recalling prior discoveries", source: "MEMORY" },
  remember_fact: { label: "Committing fact to memory", source: "MEMORY" },
  search_live_astronomy: { label: "Querying live sky databases", source: "SIMBAD / EXO / JPL" },
  search_nasa_ads: { label: "Scanning peer-reviewed research", source: "NASA ADS" },
  search_mpc: { label: "Pulling orbital elements", source: "MPC" },
  classify_celestial_body: { label: "Recognizing object", source: "ASTRO CORE" },
  get_celestial_info: { label: "Loading local data record", source: "ASTRO DB" },
  search_by_property: { label: "Searching by property", source: "ASTRO DB" },
  compare_celestial_bodies: { label: "Assembling comparison", source: "ASTRO DB" },
  list_object_types: { label: "Listing catalogued objects", source: "ASTRO DB" },
};

export const OBJECT_LABELS: Record<string, string> = {
  planet: "Planet",
  ringed_planet: "Ringed Planet",
  star: "Star",
  moon: "Moon",
  asteroid: "Asteroid",
  comet: "Comet",
  nebula: "Nebula",
  black_hole: "Black Hole",
  galaxy: "Galaxy",
};
