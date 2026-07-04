"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface AstroSearchProps {
  onSubmit: (query: string) => void;
  isStreaming: boolean;
}

// Typed targets — one per object class the agent recognizes.
const SUGGESTIONS: Array<{ q: string; tag: string }> = [
  { q: "Saturn", tag: "PLANET" },
  { q: "Europa", tag: "MOON" },
  { q: "Betelgeuse", tag: "STAR" },
  { q: "TRAPPIST-1e", tag: "EXOPLANET" },
  { q: "Bennu", tag: "ASTEROID" },
  { q: "Halley's Comet", tag: "COMET" },
  { q: "Crab Nebula", tag: "NEBULA" },
  { q: "Sagittarius A*", tag: "BLACK HOLE" },
  { q: "Andromeda Galaxy", tag: "GALAXY" },
];

export default function AstroSearch({ onSubmit, isStreaming }: AstroSearchProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut: ⌘K / Ctrl+K (or "/") focuses the search bar
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const isShortcut = (e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && document.activeElement !== inputRef.current);
      if (isShortcut) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setQuery("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Command bar */}
      <motion.div className="group relative" animate={{ scale: focused ? 1.015 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
        <motion.div
          className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-500/40 via-blue-500/30 to-violet-500/40 blur-md"
          animate={{ opacity: focused ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        />
        <div className="glass-strong relative flex items-center gap-3 rounded-2xl px-5 py-4">
          <svg className="h-5 w-5 shrink-0 text-cyan-300/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search any celestial body in the universe..."
            disabled={isStreaming}
            maxLength={300}
            className="font-hud flex-1 bg-transparent text-[0.95rem] text-[#dceaff] placeholder-[#4a6a9a] outline-none disabled:opacity-50"
            autoFocus
          />

          {/* Keyboard hint */}
          <AnimatePresence>
            {!focused && !query && !isStreaming && (
              <motion.kbd
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.18 }}
                className="font-hud pointer-events-none hidden shrink-0 items-center gap-1 rounded-md border border-[rgba(120,180,255,0.18)] bg-[rgba(10,20,44,0.6)] px-2 py-1 text-[10px] tracking-wider text-[#6e8cba] sm:flex"
              >
                <span className="text-[11px]">⌘</span>K
              </motion.kbd>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={submit}
            disabled={!query.trim() || isStreaming}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="group/btn flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-[0.82rem] font-semibold tracking-wide text-white shadow-[0_4px_20px_rgba(56,160,255,0.35)] transition-colors duration-200 hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-600 disabled:shadow-none"
          >
            {isStreaming ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                Scanning
              </>
            ) : (
              <>
                Explore
                <svg className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Suggestion chips */}
      <motion.div
        className="mt-5 flex flex-wrap justify-center gap-2"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.9 } } }}
      >
        {SUGGESTIONS.map((s) => (
          <motion.button
            key={s.q}
            type="button"
            onClick={() => !isStreaming && onSubmit(s.q)}
            disabled={isStreaming}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -2, scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="group/chip font-hud flex items-center gap-2 rounded-full border border-[rgba(120,180,255,0.18)] bg-[rgba(10,20,44,0.5)] px-3.5 py-1.5 text-[11px] tracking-wide text-[#8fb0e0] hover:border-[rgba(120,180,255,0.45)] hover:bg-[rgba(40,80,160,0.25)] hover:text-[#cfe2ff] disabled:opacity-40"
          >
            <span className="text-[7.5px] tracking-[0.18em] text-[#48628c] transition-colors group-hover/chip:text-[#6f92c4]">{s.tag}</span>
            {s.q}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
