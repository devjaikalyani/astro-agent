"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import AnalysisPanel from "@/components/AnalysisPanel";
import MissionLog from "@/components/MissionLog";
import { ChatMessage, LogEntry, ObjectType, OBJECT_LABELS, SSEEvent, TOOL_META } from "@/lib/types";

const ExploreScene = dynamic(() => import("@/components/ExploreScene"), { ssr: false });

// Instant client-side guess so the 3D scene starts building immediately;
// the backend recognition engine corrects it within the first SSE frames.
function inferType(query: string): ObjectType {
  const q = query.toLowerCase();
  if (/black.?hole|singularity|event.?horizon|hawking|sagittarius.?a|sgr.?a/.test(q)) return "black_hole";
  if (/nebula|supernova|pillars of creation|eagle|orion|crab|lagoon|carina|helix|gas.?cloud|emission|planetary nebula/.test(q)) return "nebula";
  if (/galax|milky.?way|andromeda|triangulum|magellanic|sombrero|whirlpool|local group|deep field|spiral|elliptical|quasar/.test(q)) return "galaxy";
  if (/comet|halley|hale.?bopp|67p|churyumov|oort/.test(q)) return "comet";
  if (/asteroid|meteor|ceres|vesta|pallas|hygiea|bennu|ryugu|itokawa|\beros\b|kuiper|trojan|minor planet/.test(q)) return "asteroid";
  if (/\bmoon\b|luna\b|europa|titan|ganymede|callisto|\bio\b|enceladus|triton|phobos|deimos|mimas|tethys|dione|rhea|iapetus|charon|miranda/.test(q)) return "moon";
  if (/\bstar\b|stellar|\bsun\b|solar|sirius|betelgeuse|rigel|vega|polaris|proxima|alpha centauri|antares|aldebaran|arcturus|canis majoris|\bvy cma\b|hypergiant|supergiant|red giant|red dwarf|brown dwarf|white dwarf|neutron|pulsar|magnetar/.test(q)) return "star";
  if (/\bsaturn\b|\buranus\b|ringed.?planet/.test(q)) return "ringed_planet";
  if (/planet|\bearth\b|terra\b|mars|venus|jupiter|neptune|mercury|pluto|eris|haumea|makemake|exoplanet|kepler|trappist|great red spot/.test(q)) return "planet";
  return null;
}

function ExploreContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = decodeURIComponent(params.query as string);
  const model = searchParams.get("model") || "llama-3.3-70b-versatile";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);
  const [sceneType, setSceneType] = useState<ObjectType>(() => inferType(query));
  const [objectName, setObjectName] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to ASTRO");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);

  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);
  const runningToolsRef = useRef<Map<string, number>>(new Map());
  const startedRef = useRef(false);

  const commitMessage = useCallback((msg: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, msg];
    setMessages(messagesRef.current);
  }, []);

  const addLog = useCallback((entry: Omit<LogEntry, "id">): number => {
    const id = ++logIdRef.current;
    setLog((prev) => [...prev.slice(-60), { ...entry, id }]);
    return id;
  }, []);

  const resolveLog = useCallback((id: number, detail?: string) => {
    setLog((prev) => prev.map((e) => (e.id === id ? { ...e, state: "done" as const, detail: detail ?? e.detail } : e)));
  }, []);

  const stream = useCallback(
    async (question: string, history: ChatMessage[]) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setStreamingText("");
      setIsStreaming(true);
      setStatus("Connecting to ASTRO");
      let acc = "";

      const finish = () => {
        if (acc) {
          commitMessage({ role: "assistant", content: acc });
          acc = ""; // stream close also calls finish — never commit twice
        }
        setStreamingText("");
        setIsStreaming(false);
      };

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: question, model, history }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          setStatus("Connection failed");
          addLog({ kind: "error", label: "Uplink failed", detail: `HTTP ${res.status}`, state: "done" });
          acc = "*Could not reach ASTRO. Check that the backend is running, then retry.*";
          finish();
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
              if (ev.type === "classified") {
                if (ev.scene_type) setSceneType(ev.scene_type as ObjectType);
                if (ev.object_name) setObjectName(ev.object_name);
                addLog({
                  kind: "recognition",
                  label: ev.object_type ? "Object recognized" : "Recognition deferred to live data",
                  detail: ev.object_type
                    ? `${ev.object_name ?? question} — ${OBJECT_LABELS[ev.object_type] ?? ev.object_type}`
                    : undefined,
                  source: "ASTRO CORE",
                  state: "done",
                });
              } else if (ev.type === "status") {
                setStatus(ev.message);
              } else if (ev.type === "text_delta") {
                acc += ev.text;
                setStreamingText(acc);
                setStatus("Composing analysis");
              } else if (ev.type === "tool_call") {
                const meta = TOOL_META[ev.name] ?? { label: ev.name, source: "TOOL" };
                const id = addLog({ kind: "tool", label: meta.label, source: meta.source, state: "running" });
                runningToolsRef.current.set(ev.name, id);
                setStatus(meta.label);
              } else if (ev.type === "tool_result") {
                const id = runningToolsRef.current.get(ev.name);
                if (id !== undefined) {
                  resolveLog(id, ev.summary);
                  runningToolsRef.current.delete(ev.name);
                }
                if (ev.scene_type || ev.object_type) setSceneType((ev.scene_type || ev.object_type) as ObjectType);
                if (ev.object_name) setObjectName(ev.object_name);
              } else if (ev.type === "memory") {
                addLog({
                  kind: "memory",
                  label: ev.action === "stored" ? "Fact learned" : "Memory recalled",
                  detail: ev.detail,
                  source: "MEMORY",
                  state: "done",
                });
              } else if (ev.type === "error") {
                addLog({ kind: "error", label: "Transmission error", detail: ev.message, state: "done" });
                acc = acc ? `${acc}\n\n*${ev.message}*` : `*${ev.message}*`;
                setStreamingText(acc);
              } else if (ev.type === "done") {
                finish();
              }
            } catch {
              /* skip malformed frame */
            }
          }
        }
        finish();
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        addLog({ kind: "error", label: "Uplink lost", state: "done" });
        finish();
      }
    },
    [model, addLog, resolveLog, commitMessage],
  );

  const ask = useCallback(
    (question: string, isFollowUp = true) => {
      // Cap turns and per-message size so follow-ups stay within backend
      // validation limits and free-tier token budgets.
      const history = messagesRef.current.slice(-20).map((m) => ({
        role: m.role,
        content: m.content.length > 6000 ? `${m.content.slice(0, 6000)}\n\n[truncated]` : m.content,
      }));
      commitMessage({ role: "user", content: question });
      if (isFollowUp) {
        addLog({ kind: "recognition", label: "Follow-up transmitted", detail: question.slice(0, 80), state: "done" });
      }
      void stream(question, history);
    },
    [stream, commitMessage, addLog],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (typeof window !== "undefined" && window.innerWidth < 1024) setPanelOpen(false);
    ask(query, false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = objectName || query;
  const displayType = sceneType ? (OBJECT_LABELS[sceneType] ?? sceneType) : "Unidentified";

  return (
    <div className="hud-frame fixed inset-0 overflow-hidden">
      <ExploreScene objectType={sceneType} objectName={objectName || query} shifted={panelOpen} />

      {/* Vignette */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,10,0.6) 100%)" }}
      />

      {/* Top bar */}
      <motion.div
        className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-5 py-4"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <button
          type="button"
          onClick={() => router.push("/")}
          className="glass pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-[#7da3d6] transition-colors duration-200 hover:text-[#cfe2ff]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-semibold tracking-[0.18em]">ASTRO</span>
        </button>

        <div className="font-hud pointer-events-none hidden text-[9px] tracking-[0.34em] text-[#3f5a85] md:block">
          SIMBAD · EXOPLANET ARCHIVE · JPL HORIZONS · NASA ADS · MPC
        </div>
      </motion.div>

      {/* Left rail: telemetry + mission log */}
      <motion.div
        className="pointer-events-none fixed bottom-32 left-5 top-20 z-10 hidden w-[280px] flex-col gap-3 lg:flex"
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="glass grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl px-4 py-4">
          {[
            ["TARGET", displayName],
            ["CLASS", displayType],
            ["MODEL", model.split("-").slice(0, 2).join(" ")],
            ["STATUS", isStreaming ? "scanning" : "locked"],
          ].map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col gap-0.5">
              <span className="font-hud text-[8px] tracking-[0.34em] text-[#46618c]">{k}</span>
              <span className="font-hud truncate text-[11.5px] capitalize text-[#bcd4f5]">{v}</span>
            </div>
          ))}
        </div>

        <MissionLog entries={log} />
      </motion.div>

      {/* Object title — bottom left, above the HUD frame corner */}
      <motion.div
        className="pointer-events-none fixed bottom-9 left-6 z-10 max-w-[46vw] lg:left-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 rounded-full ${isStreaming ? "pulse-dot bg-cyan-400" : "bg-emerald-400"}`} />
          <span className="eyebrow text-[9px]">{displayType}</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.h1
            key={displayName}
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="truncate bg-gradient-to-r from-cyan-200 via-blue-200 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl lg:text-5xl"
          >
            {displayName}
          </motion.h1>
        </AnimatePresence>
      </motion.div>

      {/* Reopen button when the panel is collapsed */}
      <AnimatePresence>
        {!panelOpen && (
          <motion.button
            type="button"
            onClick={() => setPanelOpen(true)}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12, transition: { duration: 0.18 } }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="glass-strong fixed bottom-9 right-8 z-30 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-[#bcd6f5] transition-colors duration-200 hover:text-[#e6f1ff]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Analysis
            {isStreaming && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Analysis panel — persistent side panel, full-screen sheet on mobile */}
      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            className="fixed right-0 top-0 z-40 h-full w-full sm:w-[min(500px,100vw)]"
            initial={{ x: "100%" }}
            animate={{ x: 0, transition: { type: "spring", stiffness: 260, damping: 30 } }}
            exit={{ x: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
          >
            <AnalysisPanel
              objectName={displayName}
              objectClass={displayType}
              messages={messages}
              streamingText={streamingText}
              isStreaming={isStreaming}
              status={status}
              onAsk={ask}
              onClose={() => setPanelOpen(false)}
            />
          </motion.aside>
        )}
      </AnimatePresence>
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
