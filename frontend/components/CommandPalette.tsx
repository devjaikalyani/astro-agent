"use client";

// Command palette (Cmd+K / "/"): search any celestial body in the universe.
// Live recognition preview via the backend engine; typed target shortcuts.

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { recognizeQuery } from "@/lib/api";

export interface PaletteResult {
  query: string;
  scene: string | null;
  name: string | null;
  solar_body: string | null;
}

const TARGETS: Array<{ q: string; tag: string }> = [
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

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (r: PaletteResult) => void;
}

export default function CommandPalette({ open, onClose, onSubmit }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ type: string | null; name: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPreview(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setPreview(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await recognizeQuery(q);
      if (r) setPreview({ type: r.object_type, name: r.name });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const go = async (q: string) => {
    const r = await recognizeQuery(q);
    onSubmit({
      query: q,
      scene: r?.scene ?? null,
      name: r?.name ?? null,
      solar_body: r?.solar_body ?? null,
    });
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) void go(q);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-1/2 top-[16vh] z-[70] w-[min(620px,92vw)] -translate-x-1/2"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <form onSubmit={submit} className="ticks panel-solid border border-[rgba(255,196,120,0.25)]">
              <div className="hairline-b flex items-center gap-3 px-5 py-4">
                <span className="font-mono text-[10px] tracking-[0.3em] text-[#ffb454]">TARGET</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && onClose()}
                  placeholder="Any celestial body in the universe…"
                  maxLength={300}
                  className="flex-1 bg-transparent text-[0.95rem] text-[#f0eadf] placeholder-[#5f5849] outline-none"
                />
                {preview?.type && (
                  <span className="shrink-0 border border-[rgba(255,196,120,0.3)] px-2 py-0.5 font-mono text-[8px] tracking-[0.2em] text-[#ffb454]">
                    {preview.type.replace(/_/g, " ").toUpperCase()}
                  </span>
                )}
                <kbd className="hidden shrink-0 border border-[rgba(255,196,120,0.16)] px-1.5 py-0.5 font-mono text-[9px] text-[#6b6355] sm:block">
                  ESC
                </kbd>
              </div>

              <div className="px-5 py-4">
                <p className="label-mono mb-3">Known targets</p>
                <div className="flex flex-wrap gap-1.5">
                  {TARGETS.map((s) => (
                    <button
                      key={s.q}
                      type="button"
                      onClick={() => void go(s.q)}
                      className="group flex items-center gap-2 border border-[rgba(255,196,120,0.14)] bg-[rgba(255,180,84,0.03)] px-3 py-1.5 font-mono text-[10.5px] tracking-wide text-[#a89e8c] transition-colors hover:border-[rgba(255,196,120,0.4)] hover:text-[#f0eadf]"
                    >
                      <span className="text-[7px] tracking-[0.18em] text-[#5f5849] transition-colors group-hover:text-[#ffb454]">
                        {s.tag}
                      </span>
                      {s.q}
                    </button>
                  ))}
                </div>
                <p className="mt-4 font-mono text-[8.5px] leading-relaxed tracking-[0.12em] text-[#4f4a3f]">
                  SOLAR BODIES FLY IN-SYSTEM · EVERYTHING ELSE WARPS TO A DEEP FIELD
                </p>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
