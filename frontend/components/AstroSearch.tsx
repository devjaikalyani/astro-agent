"use client";

import { useState, KeyboardEvent } from "react";

interface AstroSearchProps {
  onSubmit: (query: string) => void;
  isStreaming: boolean;
}

const SUGGESTIONS = [
  "Tell me about Europa",
  "What is a black hole?",
  "Compare Mars and Earth",
  "Which moons have liquid water?",
  "Explain the Crab Nebula",
  "How big is Betelgeuse?",
  "What is Sagittarius A*?",
  "List all known moons with oceans",
];

export default function AstroSearch({ onSubmit, isStreaming }: AstroSearchProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setQuery("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleSuggestion = (s: string) => {
    if (isStreaming) return;
    onSubmit(s);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Input */}
      <div className="relative group">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/20 via-cyan-500/10 to-purple-600/20 blur-xl opacity-60 group-focus-within:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center glass-card rounded-2xl px-5 py-4 gap-3">
          {/* Icon */}
          <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about any celestial body in space..."
            disabled={isStreaming}
            className="font-hud flex-1 bg-transparent text-[#d8e8ff] placeholder-[#4a6a9a] text-[0.9rem] outline-none disabled:opacity-50"
            autoFocus
          />

          <button
            onClick={handleSubmit}
            disabled={!query.trim() || isStreaming}
            className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/40 disabled:text-blue-700 text-white text-[0.8rem] font-semibold tracking-wide px-4 py-2 rounded-xl transition-all duration-200"
          >
            {isStreaming ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                Scanning
              </>
            ) : (
              <>
                <span>Explore</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {!isStreaming && (
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="text-xs text-[#8baad6] hover:text-[#c0d8ff] border border-[rgba(26,111,255,0.28)] hover:border-[rgba(26,111,255,0.55)] bg-[rgba(0,10,30,0.55)] hover:bg-[rgba(26,111,255,0.12)] px-3 py-1.5 rounded-full transition-all duration-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
