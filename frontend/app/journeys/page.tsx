"use client";

// The departure hall: agent-composed narrated voyages, listed like a
// timetable over a live 3D platform scene.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import TopNav from "@/components/TopNav";
import { useModel } from "@/components/useModel";
import { composeJourney, fetchPresets } from "@/lib/api";
import { Backdrop, createBackdrop } from "@/lib/engine/backdrop";

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

const COMPOSE_PHASES = [
  "CONTACTING ASTRO",
  "PLOTTING THE ROUTE",
  "WRITING NARRATION",
  "CLEARING FOR LAUNCH",
];

export default function JourneysPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<Backdrop | null>(null);

  const [model, setModel] = useModel();
  const [presets, setPresets] = useState<Preset[]>(FALLBACK_PRESETS);
  const [customTheme, setCustomTheme] = useState("");
  const [composing, setComposing] = useState<string | null>(null);
  const [composePhase, setComposePhase] = useState(0);
  const [composeTitle, setComposeTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets().then((p) => p.length > 0 && setPresets(p));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    backdropRef.current = createBackdrop(canvas);
    return () => {
      backdropRef.current?.dispose();
      backdropRef.current = null;
    };
  }, []);

  // Cycle status text while the agent composes
  useEffect(() => {
    if (!composing) return;
    setComposePhase(0);
    const t = setInterval(() => setComposePhase((p) => Math.min(p + 1, COMPOSE_PHASES.length - 1)), 2400);
    return () => clearInterval(t);
  }, [composing]);

  const launch = async (theme: string, key: string, title: string) => {
    if (composing) return;
    setComposing(key);
    setComposeTitle(title);
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
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "linear-gradient(90deg, rgba(4,5,10,0.72) 0%, rgba(4,5,10,0.35) 45%, rgba(4,5,10,0.12) 100%)" }}
      />
      <TopNav model={model} onModelChange={setModel} />

      <div className="relative z-10 flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-24 sm:px-10">
          <motion.header
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mb-12 sm:mb-16"
          >
            <p className="eyebrow mb-4">Departures · Agent-Narrated Voyages</p>
            <h1 className="font-display text-[clamp(2.6rem,7vw,4.8rem)] font-light leading-[1.02] tracking-[0.01em] text-[#f0eadf]">
              Journeys
            </h1>
            <p className="font-serif mt-5 max-w-xl text-[1.05rem] italic leading-relaxed text-[#a89e8c]">
              ASTRO plots the route, writes the narration, and flies the camera.
              Board a scheduled voyage, or name any theme in the universe and the
              agent will build one live.
            </p>
          </motion.header>

          {/* Timetable */}
          <div className="mb-14">
            <div className="hairline-b flex items-baseline justify-between pb-2">
              <span className="label-mono">Scheduled voyages</span>
              <span className="font-mono text-[8px] tracking-[0.24em] text-[#4f4a3f]">GATE / ORIGIN: SOL</span>
            </div>
            {presets.map((p, i) => (
              <motion.button
                key={p.id}
                type="button"
                disabled={composing !== null}
                onClick={() => void launch(p.builtin ? "grand-tour" : (p.theme ?? p.title), p.id, p.title)}
                className="group hairline-b relative block w-full overflow-hidden py-6 text-left transition-colors disabled:opacity-40 sm:py-7"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 + 0.09 * i, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(255,180,84,0.07)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="pointer-events-none absolute bottom-0 left-0 h-px w-0 bg-[#ffb454] transition-all duration-500 group-hover:w-full" />
                <div className="relative flex items-baseline gap-5 sm:gap-8">
                  <span className="font-mono w-8 shrink-0 text-[11px] text-[#5f5849] transition-colors group-hover:text-[#ffb454]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <h2 className="font-display text-xl font-light tracking-[0.02em] text-[#f0eadf] transition-colors group-hover:text-white sm:text-2xl">
                        {p.title}
                      </h2>
                      <span className="font-mono text-[7.5px] tracking-[0.28em] text-[#5f5849]">
                        {p.builtin ? "HAND-CRAFTED · INSTANT" : "COMPOSED LIVE"}
                      </span>
                    </div>
                    <p className="font-serif mt-1.5 text-[0.95rem] italic leading-relaxed text-[#a89e8c]">{p.subtitle}</p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-2 font-mono text-[9px] tracking-[0.26em] text-[#6b6355] transition-colors group-hover:text-[#ffb454] sm:flex">
                    BOARD
                    <svg className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
                    </svg>
                  </span>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Chart your own */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="label-mono mb-4">Or chart your own course</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = customTheme.trim();
                if (t) void launch(t, "custom", t);
              }}
              className="flex items-end gap-4 border-b border-[rgba(255,196,120,0.28)] pb-3 transition-colors focus-within:border-[rgba(255,196,120,0.6)]"
            >
              <input
                type="text"
                value={customTheme}
                onChange={(e) => setCustomTheme(e.target.value)}
                placeholder="Worlds where it rains something other than water…"
                maxLength={300}
                disabled={composing !== null}
                className="font-serif flex-1 bg-transparent text-[1.1rem] italic text-[#f0eadf] placeholder-[#5f5849] outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!customTheme.trim() || composing !== null}
                className="shrink-0 pb-0.5 font-mono text-[10px] tracking-[0.3em] text-[#ffb454] transition-opacity hover:opacity-75 disabled:opacity-25"
              >
                COMPOSE
              </button>
            </form>
            {error && <p className="mt-3 font-mono text-[10px] tracking-wide text-[#ff6a5a]">{error}</p>}
            <p className="mt-5 font-mono text-[8px] leading-relaxed tracking-[0.16em] text-[#4f4a3f]">
              LIVE COMPOSITION USES YOUR SELECTED MODEL · THE GRAND TOUR NEEDS NO QUOTA AND LAUNCHES INSTANTLY
            </p>
          </motion.div>
        </div>
      </div>

      {/* Composing overlay */}
      <AnimatePresence>
        {composing && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(4,5,10,0.82)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-[min(480px,88vw)] text-center">
              <p className="eyebrow mb-5">Composing Voyage</p>
              <h2 className="font-display mb-8 text-2xl font-light tracking-[0.03em] text-[#f0eadf]">{composeTitle}</h2>
              <div className="sweep-line mx-auto mb-6 h-px w-56 bg-[rgba(255,196,120,0.25)]" />
              <AnimatePresence mode="wait">
                <motion.p
                  key={composePhase}
                  className="font-mono text-[10px] tracking-[0.34em] text-[#a89e8c]"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                >
                  {COMPOSE_PHASES[composePhase]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
