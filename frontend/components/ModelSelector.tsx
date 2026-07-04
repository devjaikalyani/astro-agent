"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { popover } from "@/lib/motion";

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
      <motion.button
        ref={triggerRef}
        type="button"
        whileTap={{ scale: 0.97 }}
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
          "glass flex items-center gap-2.5 rounded-full px-4 py-2 text-sm transition-colors duration-200",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[rgba(120,180,255,0.4)]",
          open ? "border-[rgba(120,180,255,0.5)]" : "",
        ].join(" ")}
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
        <span className="font-medium text-[#cfe2ff]">{activeModel.label}</span>
        <span className="font-hud text-[10px] text-[#6688bb]">{activeModel.provider}</span>
        <motion.svg
          className="h-3.5 w-3.5 text-[#5577aa]"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="glass-strong absolute top-full z-50 mt-3 w-[22rem] overflow-hidden rounded-2xl"
            style={{ transformOrigin: "top center" }}
            variants={popover}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <div className="px-4 pb-2 pt-4">
              <p className="eyebrow text-[9px]">Select Model</p>
            </div>

            <motion.div
              className="flex flex-col gap-1 p-2"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } }}
            >
              {MODELS.map((m, idx) => {
                const isActive = m.id === selected;
                return (
                  <motion.button
                    key={m.id}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                    whileTap={{ scale: 0.98 }}
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
                      "relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150",
                      isActive ? "text-[#e6f1ff]" : "hover:bg-[rgba(120,180,255,0.07)]",
                    ].join(" ")}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="model-active"
                        className="absolute inset-0 rounded-xl border border-[rgba(120,180,255,0.3)] bg-[rgba(60,110,210,0.16)]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <div
                      className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all"
                      style={{
                        borderColor: isActive ? "rgb(95,233,255)" : "rgba(120,180,255,0.3)",
                        background: isActive ? "rgba(95,233,255,0.15)" : "transparent",
                      }}
                    >
                      {isActive && <div className="h-2 w-2 rounded-full bg-cyan-300" />}
                    </div>

                    <div className="relative min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${isActive ? "text-[#e6f1ff]" : "text-[#9bb2d6]"}`}>{m.label}</span>
                        {m.badge && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${BADGE_STYLES[m.badgeColor ?? "blue"]}`}>{m.badge}</span>
                        )}
                      </div>
                      <p className="font-hud mt-0.5 text-[10px] text-[#6688aa]">{m.provider}</p>
                      <p className={`mt-1 text-xs ${isActive ? "text-[#7e9bc4]" : "text-[#566f96]"}`}>{m.description}</p>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>

            <div className="border-t border-[rgba(120,180,255,0.1)] px-4 py-3">
              <p className="font-hud text-center text-[9px] tracking-wide text-[#4a6386]">Groq models are free · Claude needs an Anthropic key</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
