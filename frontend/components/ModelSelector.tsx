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
    badge: "Reasoning",
    badgeColor: "violet",
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
  cyan: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
  violet: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  blue: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
};

interface ModelSelectorProps {
  selected: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ selected, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeModel = MODELS.find((m) => m.id === selected) ?? MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !disabled) {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => optionRefs.current[0]?.focus());
          }
          if (e.key === "Escape") setOpen(false);
        }}
        disabled={disabled}
        className={[
          "glass flex items-center gap-2.5 rounded-full px-4 py-2 text-sm transition-all duration-200",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[rgba(120,180,255,0.4)]",
          open ? "border-[rgba(120,180,255,0.5)]" : "",
        ].join(" ")}
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
        <span className="font-medium text-[#cfe2ff]">{activeModel.label}</span>
        <span className="font-hud text-[10px] text-[#6688bb]">{activeModel.provider}</span>
        <svg
          className={`h-3.5 w-3.5 text-[#5577aa] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="glass-strong absolute top-full z-50 mt-3 w-[22rem] overflow-hidden rounded-2xl">
          <div className="px-4 pb-2 pt-4">
            <p className="eyebrow text-[9px]">Select Model</p>
          </div>

          <div className="flex flex-col gap-1 p-2">
            {MODELS.map((m, idx) => {
              const isActive = m.id === selected;
              return (
                <button
                  key={m.id}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      optionRefs.current[Math.min(idx + 1, MODELS.length - 1)]?.focus();
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (idx === 0) triggerRef.current?.focus();
                      else optionRefs.current[idx - 1]?.focus();
                    }
                    if (e.key === "Escape") {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                  className={[
                    "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150",
                    isActive
                      ? "border border-[rgba(120,180,255,0.3)] bg-[rgba(60,110,210,0.16)]"
                      : "border border-transparent hover:border-[rgba(120,180,255,0.15)] hover:bg-[rgba(120,180,255,0.07)]",
                  ].join(" ")}
                >
                  <div
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all"
                    style={{
                      borderColor: isActive ? "rgb(95,233,255)" : "rgba(120,180,255,0.3)",
                      background: isActive ? "rgba(95,233,255,0.15)" : "transparent",
                    }}
                  >
                    {isActive && <div className="h-2 w-2 rounded-full bg-cyan-300" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold ${isActive ? "text-[#e6f1ff]" : "text-[#9bb2d6]"}`}>{m.label}</span>
                      {m.badge && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${BADGE_STYLES[m.badgeColor ?? "blue"]}`}>{m.badge}</span>
                      )}
                    </div>
                    <p className="font-hud mt-0.5 text-[10px] text-[#6688aa]">{m.provider}</p>
                    <p className={`mt-1 text-xs ${isActive ? "text-[#7e9bc4]" : "text-[#566f96]"}`}>{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[rgba(120,180,255,0.1)] px-4 py-3">
            <p className="font-hud text-center text-[9px] tracking-wide text-[#4a6386]">Groq models are free · Claude needs an Anthropic key</p>
          </div>
        </div>
      )}
    </div>
  );
}
