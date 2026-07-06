"use client";

// Journey player: the agent narrates while the universe engine flies the
// camera stop to stop — in-system flights for solar bodies, warps for
// deep-field objects.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Journey } from "@/lib/api";
import { DeepType } from "@/lib/engine/deep";
import { Universe, createUniverse } from "@/lib/engine/universe";

const WORDS_PER_TICK = 1;
const TICK_MS = 105;
const AUTO_ADVANCE_DELAY = 3200;

export default function JourneyPlayPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const universeRef = useRef<Universe | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [stopIdx, setStopIdx] = useState(0);
  const [shownWords, setShownWords] = useState(0);
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
      // A solar stop requested while we were in a deep field: focus once home.
      if (m === "system" && pendingFocusRef.current) {
        const id = pendingFocusRef.current;
        pendingFocusRef.current = null;
        // Small delay so the swap settles before the flight starts
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

  // Enter a stop: fly + reset typewriter
  useEffect(() => {
    if (!journey) return;
    setShownWords(0);
    flyToStop(stopIdx);
  }, [journey, stopIdx, flyToStop]);

  const stop = journey?.stops[stopIdx];
  const words = stop ? stop.narration.split(/\s+/) : [];
  const done = shownWords >= words.length;

  // Typewriter
  useEffect(() => {
    if (!stop || done) return;
    const t = setInterval(() => setShownWords((w) => Math.min(words.length, w + WORDS_PER_TICK)), TICK_MS);
    return () => clearInterval(t);
  }, [stop, done, words.length]);

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

  if (!journey || !stop) return <main className="fixed inset-0 bg-[#04050a]" />;

  const isLast = stopIdx === journey.stops.length - 1;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      {/* Top bar */}
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-medium tracking-[0.28em] text-[#f0eadf]">ASTRO</span>
          <span className="font-mono hidden text-[8px] tracking-[0.32em] text-[#6b6355] sm:inline">JOURNEY</span>
        </div>
        <div className="panel flex items-center gap-4 px-4 py-2">
          <span className="font-mono max-w-[40vw] truncate text-[10px] tracking-[0.18em] text-[#a89e8c]">
            {journey.title.toUpperCase()}
          </span>
          <span className="font-mono text-[10px] text-[#ffb454]">
            {String(stopIdx + 1).padStart(2, "0")} / {String(journey.stops.length).padStart(2, "0")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/journeys")}
          className="panel px-3.5 py-2 font-mono text-[9px] tracking-[0.24em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
        >
          EXIT
        </button>
      </div>

      {/* Narration */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={stopIdx}
              className="ticks panel px-6 py-5 sm:px-8 sm:py-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="eyebrow">{stop.type.replace(/_/g, " ")}</span>
                <h2 className="font-display text-xl font-medium tracking-[0.02em] text-[#f0eadf]">{stop.name}</h2>
                {stop.headline && (
                  <span className="font-serif text-[0.95rem] italic text-[#c8a86a]">{stop.headline}</span>
                )}
              </div>

              <p className="narration min-h-[5.5rem] sm:min-h-[6.5rem]">
                {words.slice(0, shownWords).join(" ")}
                {!done && <span className="stream-caret" />}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {journey.stops.map((s, i) => (
                    <button
                      key={`${s.name}-${i}`}
                      type="button"
                      aria-label={`Go to stop ${i + 1}: ${s.name}`}
                      onClick={() => setStopIdx(i)}
                      className={`h-[3px] w-6 transition-colors ${i === stopIdx ? "bg-[#ffb454]" : i < stopIdx ? "bg-[rgba(255,180,84,0.4)]" : "bg-[rgba(255,196,120,0.14)]"}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {!done && (
                    <button
                      type="button"
                      onClick={() => setShownWords(words.length)}
                      className="px-2 py-1.5 font-mono text-[9px] tracking-[0.2em] text-[#6b6355] transition-colors hover:text-[#f0eadf]"
                    >
                      SKIP
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAuto((a) => !a)}
                    className={`border px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] transition-colors ${auto ? "border-[rgba(255,196,120,0.4)] text-[#ffb454]" : "border-[rgba(255,196,120,0.14)] text-[#6b6355]"}`}
                  >
                    AUTO {auto ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    disabled={stopIdx === 0}
                    onClick={() => setStopIdx((i) => Math.max(0, i - 1))}
                    className="border border-[rgba(255,196,120,0.14)] px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-[#a89e8c] transition-colors hover:text-[#f0eadf] disabled:opacity-30"
                  >
                    PREV
                  </button>
                  {isLast ? (
                    <button
                      type="button"
                      onClick={() => router.push("/journeys")}
                      className="border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-4 py-1.5 font-mono text-[9px] tracking-[0.2em] text-[#ffb454]"
                    >
                      FINISH
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStopIdx((i) => Math.min(journey.stops.length - 1, i + 1))}
                      className="border border-[rgba(255,196,120,0.4)] bg-[rgba(255,180,84,0.12)] px-4 py-1.5 font-mono text-[9px] tracking-[0.2em] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.2)]"
                    >
                      NEXT
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
