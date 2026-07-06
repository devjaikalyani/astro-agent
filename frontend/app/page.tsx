"use client";

// The Universe — ASTRO's home. A navigable solar system: fly between
// worlds, wake the agent on any body, or warp to a deep field for
// anything beyond the system.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AgentDock from "@/components/AgentDock";
import CommandPalette, { PaletteResult } from "@/components/CommandPalette";
import TopNav from "@/components/TopNav";
import { useAgentSession } from "@/components/useAgentSession";
import { useModel } from "@/components/useModel";
import { DeepType } from "@/lib/engine/deep";
import { LabelInfo, Universe, UniverseMode, createUniverse } from "@/lib/engine/universe";
import { ALL_BODY_IDS, BODY_CARDS, BODY_NAMES } from "@/lib/universe-data";

export default function UniversePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const universeRef = useRef<Universe | null>(null);
  const labelElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [model, setModel] = useModel();
  const [mode, setMode] = useState<UniverseMode>("system");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [deepName, setDeepName] = useState("");
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTarget, setDockTarget] = useState("ASTRO");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hintShown, setHintShown] = useState(true);

  const session = useAgentSession(model);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // ── Engine lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const uni = createUniverse(canvas);
    universeRef.current = uni;

    uni.onLabels((labels: LabelInfo[]) => {
      for (const l of labels) {
        const el = labelElsRef.current.get(l.id);
        if (!el) continue;
        if (!l.show) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          continue;
        }
        el.style.opacity = l.focused ? "1" : "0.85";
        el.style.pointerEvents = "auto";
        el.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -140%)`;
        el.classList.toggle("is-focused", l.focused);
      }
    });

    uni.onPick((id) => {
      uni.focus(id);
      setFocusId(id);
      setHintShown(false);
    });

    uni.onMode((m, name) => {
      setMode(m);
      if (m === "deep" && name) setDeepName(name);
      if (m === "system") {
        setDeepName("");
        setFocusId(uni.getFocus());
      }
    });

    return () => {
      uni.dispose();
      universeRef.current = null;
    };
  }, []);

  // ── Keyboard: Cmd+K / "/" opens the palette, Esc releases focus ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape" && !typing) {
        const uni = universeRef.current;
        if (uni && uni.getMode() === "system" && uni.getFocus()) {
          uni.focus(null);
          setFocusId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const engage = useCallback((id: string) => {
    const name = BODY_NAMES[id] ?? id;
    setDockTarget(name);
    setDockOpen(true);
    sessionRef.current.ask(name);
  }, []);

  const releaseFocus = useCallback(() => {
    universeRef.current?.focus(null);
    setFocusId(null);
  }, []);

  const onPaletteSubmit = useCallback((r: PaletteResult) => {
    const uni = universeRef.current;
    if (!uni) return;
    setHintShown(false);
    if (r.solar_body) {
      if (uni.getMode() === "deep") uni.returnToSystem();
      uni.focus(r.solar_body);
      setFocusId(r.solar_body);
      setDockTarget(BODY_NAMES[r.solar_body] ?? r.query);
    } else {
      const scene = (r.scene ?? "planet") as DeepType;
      uni.warp(scene, r.name ?? r.query);
      setDockTarget(r.name ?? r.query);
    }
    setDockOpen(true);
    sessionRef.current.ask(r.query);
  }, []);

  const card = focusId ? BODY_CARDS[focusId] : null;
  const focusName = focusId ? (BODY_NAMES[focusId] ?? focusId) : null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      {/* Warp flash */}
      <AnimatePresence>
        {mode === "warping" && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-30"
            style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(210,230,255,0.16) 0%, transparent 60%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Projected body labels */}
      <div className="pointer-events-none fixed inset-0 z-10">
        {ALL_BODY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            ref={(el) => {
              if (el) labelElsRef.current.set(id, el);
              else labelElsRef.current.delete(id);
            }}
            onClick={() => {
              universeRef.current?.focus(id);
              setFocusId(id);
              setHintShown(false);
            }}
            className="body-label left-0 top-0"
            style={{ opacity: 0 }}
          >
            {BODY_NAMES[id]}
          </button>
        ))}
      </div>

      <TopNav model={model} onModelChange={setModel} />

      {/* Deep field banner */}
      <AnimatePresence>
        {mode === "deep" && (
          <motion.div
            className="fixed left-1/2 top-16 z-20 -translate-x-1/2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="panel ticks flex items-center gap-4 px-5 py-2.5">
              <span className="eyebrow">Deep Field</span>
              <span className="font-display text-[13px] tracking-[0.06em] text-[#f0eadf]">{deepName}</span>
              <button
                type="button"
                onClick={() => universeRef.current?.returnToSystem()}
                className="border border-[rgba(255,196,120,0.3)] px-3 py-1 font-mono text-[9px] tracking-[0.2em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.12)]"
              >
                RETURN TO SYSTEM
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Focus card */}
      <AnimatePresence>
        {mode === "system" && focusId && card && (
          <motion.div
            key={focusId}
            className="fixed bottom-6 left-5 z-20 w-[min(360px,calc(100vw-2.5rem))] sm:left-7"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel ticks px-5 py-4">
              <p className="eyebrow mb-1.5">{card.cls}</p>
              <h2 className="font-display mb-2 text-2xl font-medium tracking-[0.02em] text-[#f0eadf]">{focusName}</h2>
              <p className="mb-3 text-[0.82rem] leading-relaxed text-[#a89e8c]">{card.blurb}</p>
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
                {card.stats.map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="font-mono text-[7.5px] tracking-[0.26em] text-[#5f5849]">{k.toUpperCase()}</span>
                    <span className="font-mono text-[11px] text-[#e8ddc8]">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => engage(focusId)}
                  className="flex-1 border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-4 py-2 font-mono text-[10px] tracking-[0.24em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.2)]"
                >
                  ENGAGE ASTRO
                </button>
                <button
                  type="button"
                  onClick={releaseFocus}
                  className="border border-[rgba(255,196,120,0.14)] px-4 py-2 font-mono text-[10px] tracking-[0.24em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
                >
                  RELEASE
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search trigger + hint */}
      <div className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-3">
        <AnimatePresence>
          {hintShown && mode === "system" && !dockOpen && (
            <motion.p
              className="max-w-[240px] text-right font-mono text-[8.5px] leading-relaxed tracking-[0.16em] text-[#5f5849]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 1.2, duration: 1 } }}
              exit={{ opacity: 0 }}
            >
              DRAG TO ORBIT · SCROLL TO ZOOM
              <br />
              CLICK ANY WORLD TO APPROACH
            </motion.p>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="panel ticks flex items-center gap-3 px-4 py-2.5 transition-colors hover:border-[rgba(255,196,120,0.4)]"
        >
          <span className="font-mono text-[10px] tracking-[0.26em] text-[#a89e8c]">SEARCH THE UNIVERSE</span>
          <kbd className="border border-[rgba(255,196,120,0.2)] px-1.5 py-0.5 font-mono text-[9px] text-[#6b6355]">⌘K</kbd>
        </button>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSubmit={onPaletteSubmit} />

      <AgentDock open={dockOpen} target={dockTarget} session={session} onClose={() => setDockOpen(false)} />

      {/* Reopen dock */}
      <AnimatePresence>
        {!dockOpen && session.messages.length > 0 && (
          <motion.button
            type="button"
            onClick={() => setDockOpen(true)}
            className="panel ticks fixed right-6 top-16 z-20 flex items-center gap-2 px-4 py-2"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${session.isStreaming ? "blink-dot bg-[#ffb454]" : "bg-[#7ec97e]"}`} />
            <span className="font-mono text-[9px] tracking-[0.24em] text-[#a89e8c]">AGENT</span>
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}
