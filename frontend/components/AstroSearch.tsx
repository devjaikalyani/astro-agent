"use client";

import { useState, KeyboardEvent } from "react";

interface AstroSearchProps {
  onSubmit: (query: string) => void;
  isStreaming: boolean;
}

const SUGGESTIONS = [
  "Europa",
  "Sagittarius A*",
  "Crab Nebula",
  "Betelgeuse",
  "Andromeda Galaxy",
  "Halley's Comet",
  "Saturn",
  "TRAPPIST-1e",
];

export default function AstroSearch({ onSubmit, isStreaming }: AstroSearchProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

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
      <div className="group relative">
        <div
          className={`absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-500/40 via-blue-500/30 to-violet-500/40 blur-md transition-opacity duration-500 ${focused ? "opacity-100" : "opacity-0"}`}
        />
        <div className="glass-strong relative flex items-center gap-3 rounded-2xl px-5 py-4">
          <svg className="h-5 w-5 shrink-0 text-cyan-300/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>

          <input
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

          <button
            type="button"
            onClick={submit}
            disabled={!query.trim() || isStreaming}
            className="group/btn flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-[0.82rem] font-semibold tracking-wide text-white shadow-[0_4px_20px_rgba(56,160,255,0.35)] transition-all duration-200 hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-blue-900/40 disabled:to-blue-900/40 disabled:text-blue-600 disabled:shadow-none"
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
          </button>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => !isStreaming && onSubmit(s)}
            disabled={isStreaming}
            className="font-hud rounded-full border border-[rgba(120,180,255,0.18)] bg-[rgba(10,20,44,0.5)] px-3.5 py-1.5 text-[11px] tracking-wide text-[#8fb0e0] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(120,180,255,0.45)] hover:bg-[rgba(40,80,160,0.25)] hover:text-[#cfe2ff] disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
