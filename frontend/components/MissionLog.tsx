"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogEntry } from "@/lib/types";

// Live feed of the agent's autonomous actions: recognition, tool calls
// against live observatories, and memory reads/writes. This is the
// "agent brain" made visible.
export default function MissionLog({ entries }: { entries: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="glass pointer-events-auto flex min-h-0 flex-col rounded-2xl">
      <div className="flex items-center justify-between border-b border-[rgba(120,180,255,0.1)] px-4 py-2.5">
        <span className="font-hud text-[9px] tracking-[0.34em] text-[#5a78a4]">MISSION LOG</span>
        <span className="font-hud text-[9px] tracking-[0.2em] text-[#3f5a85]">{entries.length}</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex gap-2.5 pb-3 last:pb-0"
            >
              {/* Timeline gutter */}
              <div className="flex flex-col items-center pt-[3px]">
                <span
                  className={[
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    e.state === "running"
                      ? "pulse-dot bg-cyan-300"
                      : e.kind === "memory"
                        ? "bg-violet-400/80"
                        : e.kind === "error"
                          ? "bg-red-400/80"
                          : "bg-[#3f5f96]",
                  ].join(" ")}
                />
                <span className="mt-1 w-px flex-1 bg-[rgba(120,180,255,0.1)]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={[
                      "font-hud truncate text-[10.5px] tracking-[0.06em]",
                      e.state === "running" ? "text-[#a8ccf5]" : "text-[#7593bd]",
                    ].join(" ")}
                  >
                    {e.label}
                  </span>
                  {e.source && (
                    <span className="font-hud shrink-0 rounded border border-[rgba(120,180,255,0.16)] px-1 py-px text-[7.5px] tracking-[0.14em] text-[#4a6a9a]">
                      {e.source}
                    </span>
                  )}
                </div>
                {e.detail && (
                  <p
                    className={[
                      "font-hud mt-0.5 truncate text-[9.5px] tracking-[0.04em]",
                      e.kind === "memory" ? "text-violet-300/70" : e.kind === "error" ? "text-red-300/80" : "text-[#48628c]",
                    ].join(" ")}
                  >
                    {e.detail}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {entries.length === 0 && (
          <p className="font-hud py-2 text-[10px] tracking-[0.2em] text-[#3f5a85]">AWAITING UPLINK…</p>
        )}
      </div>
    </div>
  );
}
