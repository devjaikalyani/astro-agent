"use client";

import { useState, useRef, useEffect } from "react";

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    provider: "Meta · Groq",
    description: "Most capable — deep astronomical analysis",
    badge: "Default",
    badgeColor: "cyan",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet",
    provider: "Anthropic",
    description: "Advanced reasoning and rich narrative responses",
    badge: "New",
    badgeColor: "purple",
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B",
    provider: "Meta · Groq",
    description: "Fastest responses for quick lookups",
    badge: "Fast",
    badgeColor: "blue",
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B",
    provider: "Google · Groq",
    description: "Balanced performance from Google DeepMind",
  },
];

const BADGE_STYLES: Record<string, string> = {
  cyan: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
  purple: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
  blue: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

interface ModelSelectorProps {
  selected: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ selected, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeModel = MODELS.find((m) => m.id === selected) ?? MODELS[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative flex justify-center mb-5">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={[
          "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all duration-200",
          "border border-[rgba(26,111,255,0.2)] bg-[rgba(0,8,24,0.6)]",
          "hover:border-[rgba(26,111,255,0.45)] hover:bg-[rgba(0,15,40,0.8)]",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          open ? "border-[rgba(26,111,255,0.5)] bg-[rgba(0,15,40,0.9)]" : "",
        ].join(" ")}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-[#aaccff] font-medium">{activeModel.label}</span>
        <span className="text-[#2a4a7a] text-xs">{activeModel.provider}</span>
        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-[#4466aa] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full mt-2 z-50 w-80 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: "rgba(4, 8, 28, 0.97)",
            border: "1px solid rgba(26, 111, 255, 0.2)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(26,111,255,0.1)",
          }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] text-[#2a4a7a] tracking-[0.3em] uppercase font-semibold">
              Select Model
            </p>
          </div>

          {/* Model list */}
          <div className="p-2 flex flex-col gap-1">
            {MODELS.map((m) => {
              const isActive = m.id === selected;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={[
                    "w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl transition-all duration-150",
                    isActive
                      ? "bg-[rgba(26,111,255,0.12)] border border-[rgba(26,111,255,0.3)]"
                      : "border border-transparent hover:bg-[rgba(26,111,255,0.07)] hover:border-[rgba(26,111,255,0.15)]",
                  ].join(" ")}
                >
                  {/* Check / empty circle */}
                  <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all"
                    style={{
                      borderColor: isActive ? "rgb(34,211,238)" : "rgba(26,111,255,0.3)",
                      background: isActive ? "rgba(34,211,238,0.15)" : "transparent",
                    }}
                  >
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isActive ? "text-[#e0f0ff]" : "text-[#8899bb]"}`}>
                        {m.label}
                      </span>
                      {m.badge && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide ${BADGE_STYLES[m.badgeColor ?? "blue"]}`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#3a5a8a] mt-0.5">{m.provider}</p>
                    <p className={`text-xs mt-1 ${isActive ? "text-[#5577aa]" : "text-[#2a3a5a]"}`}>
                      {m.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 py-3 border-t border-[rgba(26,111,255,0.1)]">
            <p className="text-[10px] text-[#1a2a4a] text-center">
              Groq models are free · Claude requires Anthropic API key
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
