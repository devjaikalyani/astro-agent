"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SSEEvent, ObjectType, TOOL_LABELS } from "@/lib/types";

const ExploreScene = dynamic(() => import("@/components/ExploreScene"), { ssr: false });

function inferType(query: string): ObjectType {
  const q = query.toLowerCase();
  if (/black.?hole|singularity|event.?horizon|hawking|sagittarius.?a/.test(q)) return "black_hole";
  if (/nebula|supernova.?remnant|gas.?cloud|emission.?cloud|planetary.?nebula/.test(q)) return "nebula";
  if (/galaxy|milky.?way|andromeda|spiral|elliptical.?galaxy|quasar/.test(q)) return "galaxy";
  if (/comet|halley|hale.?bopp|67p|churyumov/.test(q)) return "comet";
  if (/asteroid|meteor|ceres|vesta|bennu|ryugu/.test(q)) return "asteroid";
  if (/\bmoon\b|europa|titan|ganymede|callisto|io\b|enceladus|triton|phobos|deimos|luna/.test(q)) return "moon";
  if (/\bstar\b|stellar|sirius|betelgeuse|rigel|vega|polaris|proxima|neutron.?star|pulsar|white.?dwarf|red.?giant|supergiant/.test(q)) return "star";
  if (/\bsun\b|solar/.test(q)) return "star";
  if (/\bsaturn\b|\buranus\b|ringed.?planet/.test(q)) return "ringed_planet";
  if (/planet|mars|venus|jupiter|neptune|mercury|pluto|exoplanet|kepler/.test(q)) return "planet";
  return null;
}

function ExploreContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = decodeURIComponent(params.query as string);
  const model = searchParams.get("model") || "llama-3.3-70b-versatile";

  const [responseText, setResponseText] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);
  const [objectType, setObjectType] = useState<ObjectType>(() => inferType(query));
  const [objectName, setObjectName] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to ASTRO");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setResponseText("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, model }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setStatus("Connection failed");
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev: SSEEvent = JSON.parse(line.slice(6));
            if (ev.type === "text_delta") {
              setResponseText((p) => p + ev.text);
              setStatus("Composing analysis");
            } else if (ev.type === "tool_call") {
              setStatus(TOOL_LABELS[ev.name] ?? "Working");
            } else if (ev.type === "tool_result") {
              if (ev.object_type) setObjectType(ev.object_type as ObjectType);
              if (ev.object_name) setObjectName(ev.object_name);
            } else if (ev.type === "error") {
              setResponseText((p) => (p ? `${p}\n\n*${ev.message}*` : `*${ev.message}*`));
              setIsStreaming(false);
            } else if (ev.type === "done") {
              setIsStreaming(false);
            }
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") setIsStreaming(false);
    } finally {
      setIsStreaming(false);
    }
  }, [query, model]);

  useEffect(() => {
    stream();
    return () => abortRef.current?.abort();
  }, [stream]);

  // Open the analysis drawer automatically once the first text arrives
  useEffect(() => {
    if (responseText && !drawerOpen) setDrawerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseText !== ""]);

  const displayName = objectName || query;
  const displayType = objectType?.replace(/_/g, " ") ?? "unidentified";

  return (
    <div className="hud-frame fixed inset-0 overflow-hidden">
      <ExploreScene objectType={objectType} objectName={objectName || query} />

      {/* Vignette */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,10,0.6) 100%)" }}
      />

      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="glass fixed left-6 top-6 z-20 flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-[#7da3d6] transition-all duration-200 hover:text-[#cfe2ff]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="font-semibold tracking-[0.18em]">ASTRO</span>
      </button>

      {/* Live status / telemetry */}
      <div className="glass fixed right-6 top-6 z-20 flex items-center gap-2.5 rounded-xl px-4 py-2">
        <span className="relative flex h-2 w-2">
          {isStreaming && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${isStreaming ? "bg-cyan-400" : "bg-emerald-400"}`} />
        </span>
        <span className="font-hud text-[10px] uppercase tracking-[0.22em] text-[#83a8d8]">
          {isStreaming ? status : "Analysis complete"}
        </span>
      </div>

      {/* Left telemetry readout */}
      <div className="glass pointer-events-none fixed left-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 rounded-2xl px-5 py-5 md:flex">
        {[
          ["TARGET", displayName],
          ["CLASS", displayType],
          ["MODEL", model.split("-").slice(0, 2).join(" ")],
          ["STATUS", isStreaming ? "scanning" : "locked"],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="font-hud text-[8px] tracking-[0.4em] text-[#46618c]">{k}</span>
            <span className="font-hud max-w-[12rem] truncate text-[12px] capitalize text-[#bcd4f5]">{v}</span>
          </div>
        ))}
      </div>

      {/* Object title — bottom center */}
      <div className="rise pointer-events-none fixed bottom-10 left-1/2 z-20 -translate-x-1/2 text-center">
        <div className="mb-2.5 inline-flex items-center gap-2.5">
          <span className="h-px w-6 bg-gradient-to-r from-transparent to-blue-500/60" />
          <span className="eyebrow text-[9px]">{displayType}</span>
          <span className="h-px w-6 bg-gradient-to-l from-transparent to-blue-500/60" />
        </div>
        <h1 className="bg-gradient-to-r from-cyan-200 via-blue-200 to-violet-300 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          {displayName}
        </h1>
      </div>

      {/* Analysis toggle */}
      {responseText && !drawerOpen && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="glass-strong ring-ping fixed bottom-10 right-8 z-20 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-[#bcd6f5] transition-all duration-200 hover:text-[#e6f1ff]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Analysis
        </button>
      )}

      {/* Analysis drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside
            className="drawer-in glass-strong fixed right-0 top-0 z-40 flex h-full flex-col"
            style={{ width: "min(480px, 100vw)" }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(120,180,255,0.1)] px-6 py-5">
              <div className="flex items-center gap-2.5">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-semibold tracking-wide text-[#cfe2ff]">{displayName}</span>
                <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-[#5a78a4]">· {displayType}</span>
              </div>
              <button
                type="button"
                aria-label="Close analysis"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-[#476394] transition-colors hover:bg-[rgba(120,180,255,0.1)] hover:text-[#cfe2ff]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {responseText ? (
                <div className={`astro-response ${isStreaming ? "streaming-cursor" : ""}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{responseText}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-4">
                  <span className="flex items-end gap-1" style={{ height: "1.4rem" }}>
                    {[0, 120, 240].map((d) => (
                      <span
                        key={d}
                        className="w-[3px] animate-bounce rounded-full bg-blue-500/65"
                        style={{ height: d === 120 ? "1.3rem" : "0.8rem", animationDelay: `${d}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-sm tracking-wide text-[#7593bd]">{status}…</span>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreContent />
    </Suspense>
  );
}
