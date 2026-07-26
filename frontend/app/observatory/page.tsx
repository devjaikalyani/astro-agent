"use client";

// The Observatory: the agent's memory rendered as a living constellation.
// Every learned fact is a twinkling star; the sky only ever grows.
// Filter by source, pin any star, or replay the sky in the order it was
// learned.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TopNav from "@/components/TopNav";
import { KnowledgePayload, KnowledgeStar, fetchKnowledge } from "@/lib/api";
import { Constellation, SOURCE_KEYS, createConstellation, sourceKeyFor } from "@/lib/engine/constellation";

const ALL_SOURCES = [...SOURCE_KEYS.map((s) => ({ key: s.key, label: s.label, color: s.color })), { key: "agent", label: "AGENT", color: 0xf0eadf }];

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export default function ObservatoryPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Constellation | null>(null);

  const [data, setData] = useState<KnowledgePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ star: KnowledgeStar; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<KnowledgeStar | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [replayP, setReplayP] = useState<number | null>(null);

  useEffect(() => {
    fetchKnowledge(600).then((d) => {
      setData(d);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const engine = createConstellation(canvas, data.stars);
    engineRef.current = engine;
    engine.onHover((star, x, y) => setHover(star ? { star, x, y } : null));
    engine.onSelect((star) => setSelected(star));
    engine.onReplay((p) => setReplayP(p >= 1 ? null : p));
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [data]);

  const toggleFilter = useCallback((key: string) => {
    setFilter((cur) => {
      const next = cur === key ? null : key;
      engineRef.current?.setFilter(next);
      return next;
    });
  }, []);

  const replay = useCallback(() => {
    setSelected(null);
    engineRef.current?.replay();
  }, []);

  // Keyboard: R replays, Esc clears selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (typing) return;
      if (e.key === "r" || e.key === "R") replay();
      if (e.key === "Escape") {
        setSelected(null);
        engineRef.current?.selectById(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  const stats = data?.stats;
  const stars = useMemo(() => data?.stars ?? [], [data]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stars) m.set(sourceKeyFor(s.source), (m.get(sourceKeyFor(s.source)) ?? 0) + 1);
    return m;
  }, [stars]);

  const recent = useMemo(
    () => [...stars].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 4),
    [stars],
  );

  const replayCount = replayP !== null ? Math.round(replayP * stars.length) : null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />
      <TopNav />

      {/* Replay banner */}
      <AnimatePresence>
        {replayP !== null && (
          <motion.div
            className="pointer-events-none fixed left-1/2 top-16 z-30 -translate-x-1/2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="panel ticks flex items-center gap-4 px-5 py-2.5">
              <span className="blink-dot h-1.5 w-1.5 rounded-full bg-[#ffb454]" />
              <span className="font-mono text-[9px] tracking-[0.26em] text-[#e8ddc8]">
                THE SKY, IN THE ORDER IT WAS LEARNED
              </span>
              <span className="font-mono text-[10px] text-[#ffb454]">
                {String(replayCount).padStart(2, "0")} / {stars.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hover && (!selected || hover.star.id !== selected.id) && (
          <motion.div
            className="pointer-events-none fixed z-30 w-[min(320px,76vw)]"
            style={{
              left: Math.min(hover.x + 16, typeof window !== "undefined" ? window.innerWidth - 340 : 0),
              top: Math.min(hover.y + 12, typeof window !== "undefined" ? window.innerHeight - 140 : 0),
            }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.13 }}
          >
            <div className="panel-solid border border-[rgba(255,196,120,0.28)] px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-mono text-[8px] tracking-[0.26em] text-[#ffb454]">{hover.star.source.toUpperCase()}</span>
                <span className="font-mono text-[8px] text-[#6b6355]">CLICK TO PIN</span>
              </div>
              <p className="line-clamp-3 text-[0.78rem] leading-relaxed text-[#e8dfd0]">{hover.star.fact}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned star */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            className="fixed bottom-6 left-5 z-20 w-[min(400px,calc(100vw-2.5rem))] sm:left-7"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ticks panel px-5 py-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className="font-mono text-[8.5px] tracking-[0.28em] text-[#ffb454]">
                  {selected.source.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    engineRef.current?.selectById(-1);
                  }}
                  className="font-mono text-[9px] tracking-[0.2em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
                >
                  RELEASE
                </button>
              </div>
              <p className="mb-3 text-[0.86rem] leading-relaxed text-[#e8dfd0]">{selected.fact}</p>
              <div className="mb-1.5 flex items-center gap-3">
                <span className="font-mono w-20 shrink-0 text-[7.5px] tracking-[0.24em] text-[#5f5849]">CONFIDENCE</span>
                <div className="h-[3px] flex-1 bg-[rgba(255,196,120,0.12)]">
                  <div className="h-full bg-[#ffb454]" style={{ width: `${Math.round(selected.confidence * 100)}%` }} />
                </div>
                <span className="font-mono text-[9px] text-[#e8ddc8]">{Math.round(selected.confidence * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[7.5px] tracking-[0.2em] text-[#5f5849]">LEARNED {selected.created_at}</span>
                <span className="font-mono text-[7.5px] tracking-[0.2em] text-[#5f5849]">RECALLED {selected.access_count}X</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instrument rail */}
      <motion.aside
        className="fixed bottom-6 right-5 top-16 z-20 flex w-[min(320px,calc(100vw-2.5rem))] flex-col sm:right-7"
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="ticks panel max-h-full overflow-y-auto px-5 py-5">
          <p className="eyebrow mb-1.5">The Agent&apos;s Memory</p>
          <h1 className="font-display mb-2.5 text-2xl font-light tracking-[0.02em] text-[#f0eadf]">Observatory</h1>
          <p className="mb-5 text-[0.8rem] leading-relaxed text-[#a89e8c]">
            Every star in this sky is a fact ASTRO chose to remember. Hover to read, click to pin,
            or replay the sky in the order it was learned.
          </p>

          <div className="mb-5 grid grid-cols-2 gap-2.5">
            <div className="border border-[rgba(255,196,120,0.14)] px-3 py-2.5">
              <p className="font-display text-xl text-[#ffb454]">{stats ? stats.facts : "—"}</p>
              <p className="font-mono mt-0.5 text-[7px] tracking-[0.24em] text-[#6b6355]">FACTS LEARNED</p>
            </div>
            <div className="border border-[rgba(255,196,120,0.14)] px-3 py-2.5">
              <p className="font-display text-xl text-[#f0eadf]">{stats ? stats.discoveries : "—"}</p>
              <p className="font-mono mt-0.5 text-[7px] tracking-[0.24em] text-[#6b6355]">DISCOVERIES</p>
            </div>
          </div>

          <button
            type="button"
            onClick={replay}
            disabled={stars.length === 0 || replayP !== null}
            className="mb-6 w-full border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.1)] px-4 py-2.5 font-mono text-[9.5px] tracking-[0.28em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.18)] disabled:opacity-30"
          >
            {replayP !== null ? "REPLAYING…" : "REPLAY THE SKY · R"}
          </button>

          <p className="label-mono mb-2.5">Sources · filter</p>
          <div className="mb-6 flex flex-col gap-0.5">
            {ALL_SOURCES.map((s) => {
              const n = counts.get(s.key) ?? 0;
              const active = filter === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={n === 0}
                  onClick={() => toggleFilter(s.key)}
                  className={`flex items-center gap-2.5 px-2 py-1.5 text-left transition-colors disabled:opacity-30 ${
                    active ? "bg-[rgba(255,180,84,0.1)]" : filter !== null ? "opacity-45 hover:opacity-90" : "hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hex(s.color) }} />
                  <span className={`font-mono flex-1 text-[8.5px] tracking-[0.2em] ${active ? "text-[#ffb454]" : "text-[#a89e8c]"}`}>
                    {s.label}
                  </span>
                  <span className="font-mono text-[9px] text-[#5f5849]">{n}</span>
                </button>
              );
            })}
          </div>

          {recent.length > 0 && (
            <>
              <p className="label-mono mb-2.5">Latest entries</p>
              <div className="flex flex-col gap-1">
                {recent.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => engineRef.current?.selectById(s.id)}
                    className="group border-l border-[rgba(255,196,120,0.18)] px-3 py-1.5 text-left transition-colors hover:border-[#ffb454] hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <p className="line-clamp-2 text-[0.72rem] leading-snug text-[#a89e8c] transition-colors group-hover:text-[#e8dfd0]">
                      {s.fact}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}

          {loaded && data && stars.length === 0 && (
            <p className="border border-[rgba(255,196,120,0.2)] bg-[rgba(255,180,84,0.05)] px-3 py-2.5 text-[0.78rem] leading-relaxed text-[#c8bfa8]">
              The sky is empty — ASTRO has not learned anything yet. Ask it about any world in the
              Universe and watch the first stars appear.
            </p>
          )}
          {loaded && !data && (
            <p className="border border-[rgba(255,107,90,0.3)] px-3 py-2.5 font-mono text-[9px] tracking-wide text-[#ff8a7a]">
              BACKEND OFFLINE — START IT WITH npm start
            </p>
          )}
        </div>
      </motion.aside>

      <p className="pointer-events-none fixed bottom-6 left-5 z-10 font-mono text-[8px] tracking-[0.22em] text-[#4f4a3f] sm:left-7">
        {selected ? "" : "DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A STAR TO PIN"}
      </p>
    </main>
  );
}
