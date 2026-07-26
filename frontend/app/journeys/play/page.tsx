"use client";

// Journey player: a letterboxed cinematic. The agent narrates while the
// universe engine flies the camera stop to stop — in-system flights for
// solar bodies, warps for deep-field objects.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Journey } from "@/lib/api";
import { DeepType } from "@/lib/engine/deep";
import { Universe, createUniverse } from "@/lib/engine/universe";

const WORDS_PER_TICK = 1;
const TICK_MS = 100;
const AUTO_ADVANCE_DELAY = 3200;
const REVEAL_MS = 1700;

export default function JourneyPlayPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const universeRef = useRef<Universe | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [stopIdx, setStopIdx] = useState(0);
  const [shownWords, setShownWords] = useState(0);
  const [reveal, setReveal] = useState(true);
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  // Load journey from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("astro-journey");
      if (!raw) {
        router.replace("/journeys");
        return;
      }
      setJourney(JSON.parse(raw) as Journey);
    } catch {
      router.replace("/journeys");
    }
  }, [router]);

  // Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !journey) return;
    const uni = createUniverse(canvas);
    universeRef.current = uni;

    uni.onMode((m) => {
      if (m === "system" && pendingFocusRef.current) {
        const id = pendingFocusRef.current;
        pendingFocusRef.current = null;
        setTimeout(() => uni.focus(id), 60);
      }
    });

    return () => {
      uni.dispose();
      universeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey === null]);

  const flyToStop = useCallback(
    (idx: number) => {
      const uni = universeRef.current;
      if (!uni || !journey) return;
      const stop = journey.stops[idx];
      if (!stop) return;
      if (stop.kind === "solar") {
        const id = stop.name.toLowerCase();
        if (uni.getMode() === "deep") {
          pendingFocusRef.current = id;
          uni.returnToSystem();
        } else {
          uni.focus(id);
        }
      } else {
        uni.warp(stop.type as DeepType, stop.name);
      }
    },
    [journey],
  );

  // Enter a stop: fly, reveal the name, then type
  useEffect(() => {
    if (!journey) return;
    setShownWords(0);
    setReveal(true);
    flyToStop(stopIdx);
    const t = setTimeout(() => setReveal(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [journey, stopIdx, flyToStop]);

  const stop = journey?.stops[stopIdx];
  const words = stop ? stop.narration.split(/\s+/) : [];
  const done = shownWords >= words.length;
  const isLast = journey ? stopIdx === journey.stops.length - 1 : false;

  // Typewriter (starts after the reveal)
  useEffect(() => {
    if (!stop || done || reveal) return;
    const t = setInterval(() => setShownWords((w) => Math.min(words.length, w + WORDS_PER_TICK)), TICK_MS);
    return () => clearInterval(t);
  }, [stop, done, reveal, words.length]);

  // Auto-advance
  useEffect(() => {
    if (!journey || !done) return;
    if (stopIdx >= journey.stops.length - 1) return;
    if (!autoRef.current) return;
    const t = setTimeout(() => {
      if (autoRef.current) setStopIdx((i) => Math.min(journey.stops.length - 1, i + 1));
    }, AUTO_ADVANCE_DELAY);
    return () => clearTimeout(t);
  }, [journey, done, stopIdx]);

  // Keyboard: arrows navigate, A toggles auto, S skips typing, Esc exits
  useEffect(() => {
    if (!journey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStopIdx((i) => Math.min(journey.stops.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setStopIdx((i) => Math.max(0, i - 1));
      else if (e.key === "a" || e.key === "A") setAuto((a) => !a);
      else if (e.key === "s" || e.key === "S") setShownWords(Number.MAX_SAFE_INTEGER);
      else if (e.key === "Escape") router.push("/journeys");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [journey, router]);

  if (!journey || !stop) return <main className="fixed inset-0 bg-[#04050a]" />;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      {/* Letterbox */}
      <motion.div
        className="pointer-events-none fixed left-0 right-0 top-0 z-10 h-28"
        style={{ background: "linear-gradient(to bottom, rgba(2,3,6,0.92) 0%, rgba(2,3,6,0.55) 45%, transparent 100%)" }}
        initial={{ y: -120 }}
        animate={{ y: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-10 h-[46vh]"
        style={{ background: "linear-gradient(to top, rgba(2,3,6,0.94) 0%, rgba(2,3,6,0.62) 40%, transparent 100%)" }}
        initial={{ y: 180 }}
        animate={{ y: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Top bar */}
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex w-40 items-center gap-3">
          <span className="font-display text-sm font-medium tracking-[0.28em] text-[#f0eadf]">ASTRO</span>
          <span className="font-mono hidden text-[8px] tracking-[0.32em] text-[#6b6355] sm:inline">VOYAGE</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-mono max-w-[46vw] truncate text-[10px] tracking-[0.3em] text-[#a89e8c]">
            {journey.title.toUpperCase()}
          </span>
          <span className="mt-1 font-mono text-[9px] tracking-[0.2em] text-[#ffb454]">
            STOP {String(stopIdx + 1).padStart(2, "0")} / {String(journey.stops.length).padStart(2, "0")}
          </span>
        </div>
        <div className="flex w-40 justify-end">
          <button
            type="button"
            onClick={() => router.push("/journeys")}
            className="font-mono text-[9px] tracking-[0.26em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
          >
            EXIT · ESC
          </button>
        </div>
      </div>

      {/* Stop-name reveal */}
      <AnimatePresence>
        {reveal && (
          <motion.div
            key={`reveal-${stopIdx}`}
            className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            <motion.p
              className="eyebrow mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.15, duration: 0.5 } }}
            >
              {stop.type.replace(/_/g, " ")}
            </motion.p>
            <motion.h2
              className="font-display px-6 text-center text-[clamp(2rem,6vw,4rem)] font-light tracking-[0.08em] text-white"
              initial={{ opacity: 0, letterSpacing: "0.3em" }}
              animate={{ opacity: 1, letterSpacing: "0.08em", transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
            >
              {stop.name}
            </motion.h2>
            {stop.headline && (
              <motion.p
                className="font-serif mt-4 px-6 text-center text-[1.05rem] italic text-[#c8a86a]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.55, duration: 0.6 } }}
              >
                {stop.headline}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Narration lower third */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-5 pb-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence mode="wait">
            {!reveal && (
              <motion.div
                key={stopIdx}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="eyebrow">{stop.type.replace(/_/g, " ")}</span>
                  <h2 className="font-display text-lg font-light tracking-[0.04em] text-[#f0eadf]">{stop.name}</h2>
                  {stop.headline && <span className="font-serif text-[0.95rem] italic text-[#c8a86a]">{stop.headline}</span>}
                </div>
                <p className="narration min-h-[5rem] text-[1.12rem] sm:min-h-[6rem]">
                  {words.slice(0, shownWords).join(" ")}
                  {!done && <span className="stream-caret" />}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Route + controls */}
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-[rgba(255,196,120,0.14)] pt-4">
            <div className="flex items-center gap-1.5">
              {journey.stops.map((s, i) => (
                <button
                  key={`${s.name}-${i}`}
                  type="button"
                  aria-label={`Go to stop ${i + 1}: ${s.name}`}
                  title={s.name}
                  onClick={() => setStopIdx(i)}
                  className={`h-[3px] w-7 transition-all duration-300 ${
                    i === stopIdx ? "bg-[#ffb454]" : i < stopIdx ? "bg-[rgba(255,180,84,0.4)]" : "bg-[rgba(255,196,120,0.14)] hover:bg-[rgba(255,196,120,0.3)]"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {!done && !reveal && (
                <button
                  type="button"
                  onClick={() => setShownWords(Number.MAX_SAFE_INTEGER)}
                  className="px-2.5 py-1.5 font-mono text-[9px] tracking-[0.22em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
                >
                  SKIP
                </button>
              )}
              <button
                type="button"
                onClick={() => setAuto((a) => !a)}
                className={`px-2.5 py-1.5 font-mono text-[9px] tracking-[0.22em] transition-colors ${auto ? "text-[#ffb454]" : "text-[#6b6355] hover:text-[#f0eadf]"}`}
              >
                AUTO {auto ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                disabled={stopIdx === 0}
                onClick={() => setStopIdx((i) => Math.max(0, i - 1))}
                className="px-2.5 py-1.5 font-mono text-[9px] tracking-[0.22em] text-[#a89e8c] transition-colors hover:text-[#f0eadf] disabled:opacity-30"
              >
                PREV
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={() => router.push("/journeys")}
                  className="border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-4 py-1.5 font-mono text-[9px] tracking-[0.22em] text-[#ffb454]"
                >
                  FINISH
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStopIdx((i) => Math.min(journey.stops.length - 1, i + 1))}
                  className="border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-4 py-1.5 font-mono text-[9px] tracking-[0.22em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.2)]"
                >
                  NEXT
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
