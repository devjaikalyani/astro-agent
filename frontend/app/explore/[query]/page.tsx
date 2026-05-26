"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SSEEvent, ObjectType } from "@/lib/types";

const ExploreScene = dynamic(() => import("@/components/ExploreScene"), { ssr: false });

const NASA_SUFFIX: Partial<Record<NonNullable<ObjectType>, string>> = {
  galaxy:        "galaxy hubble telescope",
  nebula:        "nebula hubble telescope",
  black_hole:    "black hole space",
  star:          "star telescope NASA",
  planet:        "planet NASA space",
  ringed_planet: "planet rings NASA",
  moon:          "moon surface NASA",
  comet:         "comet space NASA",
  asteroid:      "asteroid NASA",
};

async function fetchNasaImage(query: string, type: ObjectType): Promise<string | null> {
  try {
    const suffix = NASA_SUFFIX[type ?? "planet"] ?? "";
    const q = encodeURIComponent(`${query} ${suffix}`.trim());
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${q}&media_type=image&page_size=8`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: Array<{ links?: Array<{ rel: string; href: string }> }> =
      data.collection?.items ?? [];
    for (const item of items) {
      const link = item.links?.find((l) => l.rel === "preview");
      if (link?.href) return link.href.replace("~thumb.jpg", "~large.jpg");
    }
    return null;
  } catch {
    return null;
  }
}

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
  const [nasaImageUrl, setNasaImageUrl] = useState<string | null>(null);
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

      if (!res.ok || !res.body) { setIsStreaming(false); return; }

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
            if (ev.type === "text_delta") setResponseText((p) => p + ev.text);
            else if (ev.type === "tool_result") {
              if (ev.object_type) setObjectType(ev.object_type as ObjectType);
              if (ev.object_name) setObjectName(ev.object_name);
            } else if (ev.type === "done") setIsStreaming(false);
          } catch { /* skip */ }
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
    return () => { abortRef.current?.abort(); };
  }, [stream]);

  // Fetch real NASA imagery in parallel with the AI stream
  useEffect(() => {
    let active = true;
    fetchNasaImage(query, objectType).then((url) => {
      if (active && url) setNasaImageUrl(url);
    });
    return () => { active = false; };
  }, [query, objectType]);

  const displayName = objectName || query;
  const displayType = objectType?.replace(/_/g, " ");

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Full-screen 3D scene */}
      <ExploreScene objectType={objectType} objectName={objectName} nasaImageUrl={nasaImageUrl} />

      {/* Subtle vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,10,0.55) 100%)",
          zIndex: 1,
        }}
      />

      {/* ── Back button ── */}
      <button
        onClick={() => router.push("/")}
        className="fixed top-6 left-6 z-20 flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[#5577aa] hover:text-[#aaccff] border border-[rgba(26,111,255,0.15)] hover:border-[rgba(26,111,255,0.35)] bg-[rgba(0,5,20,0.65)] backdrop-blur-md transition-all duration-200"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="font-semibold tracking-wider">ASTRO</span>
      </button>

      {/* ── Scanning indicator ── */}
      {isStreaming && (
        <div className="fixed top-6 right-6 z-20 flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgba(0,5,20,0.65)] backdrop-blur-md border border-[rgba(26,111,255,0.15)]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-[#4a6a9a] tracking-widest">SCANNING</span>
        </div>
      )}

      {/* ── Object HUD — bottom center ── */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
        {displayType && (
          <p className="text-[10px] tracking-[0.4em] text-[#2a4a7a] uppercase mb-2">
            {displayType}
          </p>
        )}
        <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-400">
          {displayName}
        </h1>
      </div>

      {/* ── Analysis button — bottom right ── */}
      {responseText && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-10 right-8 z-20 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-[#99bbee] border border-[rgba(26,111,255,0.25)] bg-[rgba(0,5,20,0.7)] backdrop-blur-md hover:border-[rgba(26,111,255,0.5)] hover:text-[#ccddff] transition-all duration-200"
          style={{ boxShadow: "0 0 30px rgba(26,111,255,0.08)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Analysis
        </button>
      )}

      {/* ── Side drawer ── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Panel */}
          <div
            className="fixed right-0 top-0 h-full z-40 flex flex-col"
            style={{
              width: "min(480px, 100vw)",
              background: "rgba(2, 4, 18, 0.97)",
              borderLeft: "1px solid rgba(26,111,255,0.12)",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(26,111,255,0.1)]">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse-slow" />
                <span className="text-sm text-[#aaccff] font-semibold tracking-wide">
                  {displayName}
                </span>
                {displayType && (
                  <span className="text-[10px] text-[#2a4a7a] tracking-[0.25em] uppercase">
                    · {displayType}
                  </span>
                )}
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-[#3a5a8a] hover:text-[#aaccff] transition-colors p-1.5 rounded-lg hover:bg-[rgba(26,111,255,0.1)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {responseText ? (
                <div className={`astro-response ${isStreaming ? "streaming-cursor" : ""}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{responseText}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-[#4466aa] py-2">
                  <span className="flex gap-1">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </span>
                  Consulting stellar database...
                </div>
              )}
            </div>
          </div>
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
