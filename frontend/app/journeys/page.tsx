"use client";

// Journey library: agent-composed narrated tours through the universe.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import TopNav from "@/components/TopNav";
import { useModel } from "@/components/useModel";
import { composeJourney, fetchPresets } from "@/lib/api";

interface Preset {
  id: string;
  title: string;
  subtitle: string;
  builtin: boolean;
  theme?: string;
}

const FALLBACK_PRESETS: Preset[] = [
  { id: "grand-tour", title: "The Grand Tour", subtitle: "Sunfire to the ice line across our solar system", builtin: true },
  { id: "star-death", title: "Death of Stars", subtitle: "From red giants to supernovae, pulsars and black holes", builtin: false, theme: "The life and death of stars" },
  { id: "ocean-worlds", title: "Ocean Worlds", subtitle: "The solar system's hidden seas and where life might swim", builtin: false, theme: "Ocean worlds of the solar system" },
  { id: "edge-of-night", title: "Edge of Night", subtitle: "Outward past the ice giants to interstellar space", builtin: false, theme: "A journey to the edge of the solar system and interstellar space" },
];

export default function JourneysPage() {
  const router = useRouter();
  const [model, setModel] = useModel();
  const [presets, setPresets] = useState<Preset[]>(FALLBACK_PRESETS);
  const [customTheme, setCustomTheme] = useState("");
  const [composing, setComposing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets().then((p) => p.length > 0 && setPresets(p));
  }, []);

  const launch = async (theme: string, key: string) => {
    if (composing) return;
    setComposing(key);
    setError(null);
    try {
      const journey = await composeJourney(theme, model);
      sessionStorage.setItem("astro-journey", JSON.stringify(journey));
      router.push("/journeys/play");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journey composer unavailable.");
      setComposing(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(ellipse 900px 600px at 50% -10%, rgba(255,180,84,0.06) 0%, transparent 60%)" }}
      />
      <TopNav model={model} onModelChange={setModel} />

      <div className="mx-auto max-w-4xl px-6 pb-20 pt-28">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="eyebrow mb-3">Agent-Narrated Tours</p>
          <h1 className="font-display mb-3 text-3xl font-medium tracking-[0.02em] text-[#f0eadf] sm:text-4xl">
            Journeys
          </h1>
          <p className="mb-10 max-w-xl text-[0.92rem] leading-relaxed text-[#a89e8c]">
            ASTRO composes the route, writes the narration, and flies the camera. Pick a tour or
            name any theme in the universe — the agent builds it live.
          </p>
        </motion.div>

        <div className="mb-10 grid gap-3 sm:grid-cols-2">
          {presets.map((p, i) => (
            <motion.button
              key={p.id}
              type="button"
              disabled={composing !== null}
              onClick={() => void launch(p.builtin ? "grand-tour" : (p.theme ?? p.title), p.id)}
              className="ticks panel group relative overflow-hidden px-6 py-6 text-left transition-colors hover:border-[rgba(255,196,120,0.4)] disabled:opacity-60"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 * i }}
            >
              {composing === p.id && <span className="sweep-line absolute inset-0" />}
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[8px] tracking-[0.3em] text-[#5f5849]">
                  {p.builtin ? "INSTANT LAUNCH" : "COMPOSED LIVE BY THE AGENT"}
                </span>
                <span className="font-mono text-[9px] text-[#ffb454] opacity-0 transition-opacity group-hover:opacity-100">
                  {composing === p.id ? "COMPOSING…" : "LAUNCH"}
                </span>
              </div>
              <h2 className="font-display mb-1.5 text-lg font-medium text-[#f0eadf]">{p.title}</h2>
              <p className="text-[0.82rem] leading-relaxed text-[#a89e8c]">{p.subtitle}</p>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <p className="label-mono mb-3">Or name your own theme</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = customTheme.trim();
              if (t) void launch(t, "custom");
            }}
            className="ticks panel-solid flex items-center gap-3 border border-[rgba(255,196,120,0.2)] px-5 py-4"
          >
            <input
              type="text"
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder="e.g. Worlds where it rains something other than water…"
              maxLength={300}
              disabled={composing !== null}
              className="flex-1 bg-transparent text-[0.92rem] text-[#f0eadf] placeholder-[#5f5849] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!customTheme.trim() || composing !== null}
              className="shrink-0 border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-5 py-2 font-mono text-[10px] tracking-[0.24em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.2)] disabled:opacity-30"
            >
              {composing === "custom" ? "COMPOSING…" : "COMPOSE"}
            </button>
          </form>
          {error && <p className="mt-3 font-mono text-[10px] tracking-wide text-[#ff6a5a]">{error}</p>}
          <p className="mt-4 font-mono text-[8.5px] leading-relaxed tracking-[0.14em] text-[#4f4a3f]">
            LIVE COMPOSITION USES YOUR SELECTED MODEL · THE GRAND TOUR IS HAND-CRAFTED AND ALWAYS AVAILABLE
          </p>
        </motion.div>
      </div>
    </main>
  );
}
