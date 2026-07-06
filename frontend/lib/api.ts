// ASTRO API client: SSE v3 stream parsing plus JSON endpoints.

export type AgentEvent =
  | { e: "recognition"; body: { object_type: string | null; scene: string | null; name: string | null; solar_body: string | null; confidence: string; method: string } }
  | { e: "phase"; label: string }
  | { e: "recalled"; detail: string }
  | { e: "tool"; id: string; name: string; label: string; source: string }
  | { e: "tool_done"; id: string; summary: string; body?: { object_type?: string | null; scene?: string | null; name?: string | null } }
  | { e: "learned"; fact: string }
  | { e: "delta"; t: string }
  | { e: "fault"; message: string }
  | { e: "complete" };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface JourneyStop {
  name: string;
  kind: "solar" | "deep";
  type: string;
  headline: string;
  narration: string;
}

export interface Journey {
  id?: string;
  title: string;
  subtitle: string;
  stops: JourneyStop[];
}

export interface KnowledgeStar {
  id: number;
  fact: string;
  source: string;
  confidence: number;
  created_at: string;
  access_count: number;
  pos: [number, number, number];
}

export interface KnowledgePayload {
  stats: { facts: number; discoveries: number; last_learned_at: string | null };
  stars: KnowledgeStar[];
}

export const MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", provider: "Groq" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet", provider: "Anthropic" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", provider: "Groq" },
  { id: "gemma2-9b-it", label: "Gemma 2 9B", provider: "Groq" },
];

export const DEFAULT_MODEL = MODELS[0].id;

/** Stream the agent; onEvent fires per SSE frame. Returns an abort handle. */
export function streamAgent(opts: {
  query: string;
  model: string;
  history: ChatMessage[];
  onEvent: (ev: AgentEvent) => void;
  onClose: () => void;
}): { abort: () => void } {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: opts.query,
          model: opts.model,
          // Trimmed client-side to stay inside validation + token budgets
          history: opts.history.slice(-20).map((m) => ({
            role: m.role,
            content: m.content.length > 6000 ? `${m.content.slice(0, 6000)}\n\n[truncated]` : m.content,
          })),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        opts.onEvent({ e: "fault", message: `Could not reach ASTRO (HTTP ${res.status}). Is the backend running?` });
        opts.onClose();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            opts.onEvent(JSON.parse(line.slice(6)) as AgentEvent);
          } catch {
            /* skip malformed frame */
          }
        }
      }
      opts.onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      opts.onEvent({ e: "fault", message: "Uplink lost. Check the backend and retry." });
      opts.onClose();
    }
  })();

  return { abort: () => ctrl.abort() };
}

export async function fetchKnowledge(limit = 400): Promise<KnowledgePayload | null> {
  try {
    const r = await fetch(`/api/knowledge?limit=${limit}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function recognizeQuery(q: string): Promise<{
  object_type: string | null;
  scene: string | null;
  name: string | null;
  solar_body: string | null;
} | null> {
  try {
    const r = await fetch(`/api/recognize?q=${encodeURIComponent(q)}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function composeJourney(theme: string, model: string): Promise<Journey> {
  const r = await fetch("/api/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme, model }),
  });
  if (!r.ok) {
    let detail = "Journey composer unavailable.";
    try {
      detail = (await r.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return r.json();
}

export async function fetchPresets(): Promise<Array<{ id: string; title: string; subtitle: string; builtin: boolean; theme?: string }>> {
  try {
    const r = await fetch("/api/journeys/presets");
    if (!r.ok) return [];
    return (await r.json()).presets ?? [];
  } catch {
    return [];
  }
}
