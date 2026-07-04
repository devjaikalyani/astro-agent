"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { KnowledgeStats as Stats } from "@/lib/types";

const LIVE_SOURCES = 5; // SIMBAD, Exoplanet Archive, JPL Horizons, NASA ADS, MPC

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const dur = 1200;
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - f, 3);
      setShown(Math.round(value * eased));
      if (f < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return <span>{shown.toLocaleString()}</span>;
}

// The agent's growth, made visible on the home page: how many facts it has
// permanently learned and how many live discoveries it has indexed so far.
export default function KnowledgeStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items: Array<[string, number]> = [
    ["Facts learned", stats.facts],
    ["Discoveries indexed", stats.discoveries],
    ["Live data sources", LIVE_SOURCES],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-stretch justify-center gap-0"
    >
      {items.map(([label, value], i) => (
        <div
          key={label}
          className={[
            "flex flex-col items-center px-6 sm:px-8",
            i > 0 ? "border-l border-[rgba(120,180,255,0.14)]" : "",
          ].join(" ")}
        >
          <span className="font-hud bg-gradient-to-r from-cyan-200 to-blue-300 bg-clip-text text-xl font-semibold text-transparent sm:text-2xl">
            <CountUp value={value} />
          </span>
          <span className="font-hud mt-1 text-[8.5px] uppercase tracking-[0.3em] text-[#46618c]">{label}</span>
        </div>
      ))}
    </motion.div>
  );
}
