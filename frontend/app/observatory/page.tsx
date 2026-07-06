"use client";

// The Observatory: the agent's memory rendered as a living constellation.
// Every learned fact is a star; the sky only ever grows.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TopNav from "@/components/TopNav";
import { KnowledgePayload, KnowledgeStar, fetchKnowledge } from "@/lib/api";
import { Constellation, createConstellation } from "@/lib/engine/constellation";

const SOURCE_LEGEND: Array<[string, string]> = [
  ["SIMBAD", "#9fd8ff"],
  ["JPL HORIZONS", "#ffb454"],
  ["EXOPLANET ARCHIVE", "#c9a0ff"],
  ["NASA ADS", "#ff8fb8"],
  ["MPC", "#8fe0c0"],
  ["AGENT", "#f0eadf"],
];

export default function ObservatoryPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Constellation | null>(null);

  const [data, setData] = useState<KnowledgePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ star: KnowledgeStar; x: number; y: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

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
    engine.onHover((star, x, y) => {
      setHover(star ? { star, x, y } : null);
    });
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [data]);

  const stats = data?.stats;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />
      <TopNav />

      {/* Hover fact card */}
      <AnimatePresence>
        {hover && (
          <motion.div
            className="pointer-events-none fixed z-30 w-[min(340px,80vw)]"
            style={{
              left: Math.min(hover.x + 18, typeof window !== "undefined" ? window.innerWidth - 360 : 0),
              top: Math.min(hover.y + 14, typeof window !== "undefined" ? window.innerHeight - 180 : 0),
            }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            <div className="ticks panel-solid border border-[rgba(255,196,120,0.3)] px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="font-mono text-[8px] tracking-[0.26em] text-[#ffb454]">
                  {hover.star.source.toUpperCase()}
                </span>
                <span className="font-mono text-[8px] text-[#6b6355]">
                  CONF {Math.round(hover.star.confidence * 100)}%
                </span>
              </div>
              <p className="text-[0.8rem] leading-relaxed text-[#e8dfd0]">{hover.star.fact}</p>
              <p className="mt-2 font-mono text-[8px] tracking-[0.14em] text-[#5f5849]">
                LEARNED {hover.star.created_at}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            className="fixed left-5 top-20 z-20 w-[min(320px,calc(100vw-2.5rem))] sm:left-7"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ticks panel px-5 py-5">
              <p className="eyebrow mb-1.5">The Agent&apos;s Memory</p>
              <h1 className="font-display mb-3 text-2xl font-medium tracking-[0.02em] text-[#f0eadf]">
                Observatory
              </h1>
              <p className="mb-5 text-[0.82rem] leading-relaxed text-[#a89e8c]">
                Every star in this sky is a fact ASTRO chose to remember. It grows with every
                conversation — hover any star to read what was learned.
              </p>

              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="border border-[rgba(255,196,120,0.14)] px-3 py-2.5">
                  <p className="font-display text-xl text-[#ffb454]">{stats ? stats.facts : "—"}</p>
                  <p className="font-mono mt-0.5 text-[7.5px] tracking-[0.24em] text-[#6b6355]">FACTS LEARNED</p>
                </div>
                <div className="border border-[rgba(255,196,120,0.14)] px-3 py-2.5">
                  <p className="font-display text-xl text-[#f0eadf]">{stats ? stats.discoveries : "—"}</p>
                  <p className="font-mono mt-0.5 text-[7.5px] tracking-[0.24em] text-[#6b6355]">DISCOVERIES INDEXED</p>
                </div>
              </div>

              <p className="label-mono mb-2">Sources</p>
              <div className="mb-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {SOURCE_LEGEND.map(([name, color]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <span className="font-mono text-[8px] tracking-[0.18em] text-[#a89e8c]">{name}</span>
                  </div>
                ))}
              </div>

              {loaded && data && data.stars.length === 0 && (
                <p className="mt-4 border border-[rgba(255,196,120,0.2)] bg-[rgba(255,180,84,0.05)] px-3 py-2.5 text-[0.78rem] leading-relaxed text-[#c8bfa8]">
                  The sky is empty — ASTRO has not learned anything yet. Ask it about any world in
                  the Universe and watch the first stars appear.
                </p>
              )}
              {loaded && !data && (
                <p className="mt-4 border border-[rgba(255,107,90,0.3)] px-3 py-2.5 font-mono text-[9px] tracking-wide text-[#ff8a7a]">
                  BACKEND OFFLINE — START IT WITH npm start
                </p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="panel fixed bottom-6 left-5 z-20 px-3.5 py-2 font-mono text-[9px] tracking-[0.24em] text-[#6b6355] transition-colors hover:text-[#f0eadf] sm:left-7"
      >
        {panelOpen ? "HIDE PANEL" : "SHOW PANEL"}
      </button>

      <p className="pointer-events-none fixed bottom-6 right-6 z-20 font-mono text-[8.5px] tracking-[0.2em] text-[#4f4a3f]">
        DRAG TO ORBIT · SCROLL TO ZOOM · HOVER A STAR
      </p>
    </main>
  );
}
