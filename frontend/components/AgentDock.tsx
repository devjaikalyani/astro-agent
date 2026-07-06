"use client";

// The agent dock: conversation, live mission feed, and follow-up composer.
// Slides in from the right over the 3D universe.

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentSession, FeedEntry } from "./useAgentSession";

interface AgentDockProps {
  open: boolean;
  target: string;
  session: AgentSession;
  onClose: () => void;
}

function FeedLine({ f }: { f: FeedEntry }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <span
        className={[
          "mt-px h-1 w-1 shrink-0 rounded-full",
          f.state === "running" ? "blink-dot bg-[#ffb454]" : f.kind === "memory" ? "bg-[#c9a0ff]" : f.kind === "error" ? "bg-[#ff6a5a]" : "bg-[#5a5346]",
        ].join(" ")}
      />
      <span className={`shrink-0 font-mono text-[9px] tracking-[0.08em] ${f.state === "running" ? "text-[#e8ddc8]" : "text-[#8d8371]"}`}>
        {f.label}
      </span>
      {f.detail && <span className="truncate font-mono text-[9px] text-[#5f5849]">{f.detail}</span>}
      {f.source && (
        <span className="ml-auto shrink-0 font-mono text-[7px] tracking-[0.16em] text-[#4f4a3f]">{f.source}</span>
      )}
    </div>
  );
}

export default function AgentDock({ open, target, session, onClose }: AgentDockProps) {
  const { messages, streamingText, isStreaming, phase, feed, ask } = session;
  const [draft, setDraft] = useState("");
  const [feedOpen, setFeedOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, feed]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || isStreaming) return;
    setDraft("");
    pinnedRef.current = true;
    ask(q);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="panel-solid fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[rgba(255,196,120,0.15)] sm:w-[480px]"
          initial={{ x: "100%" }}
          animate={{ x: 0, transition: { type: "spring", stiffness: 280, damping: 32 } }}
          exit={{ x: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
        >
          {/* Header */}
          <div className="hairline-b flex items-center justify-between px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isStreaming ? "blink-dot bg-[#ffb454]" : "bg-[#7ec97e]"}`} />
              <span className="font-display truncate text-[13px] font-medium tracking-[0.08em] text-[#f0eadf]">{target}</span>
              <span className="font-mono shrink-0 text-[8px] tracking-[0.28em] text-[#6b6355]">
                {isStreaming ? phase.toUpperCase() : "LINKED"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close agent dock"
              onClick={onClose}
              className="p-1.5 text-[#6b6355] transition-colors hover:text-[#f0eadf]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mission feed */}
          <div className="hairline-b px-5 py-2">
            <button
              type="button"
              onClick={() => setFeedOpen((v) => !v)}
              className="flex w-full items-center justify-between py-0.5"
            >
              <span className="eyebrow">Mission Feed</span>
              <span className="font-mono text-[9px] text-[#6b6355]">{feedOpen ? "HIDE" : `${feed.length}`}</span>
            </button>
            {feedOpen && (
              <div className="max-h-[130px] overflow-y-auto py-1">
                {feed.length === 0 ? (
                  <p className="py-1 font-mono text-[9px] tracking-[0.2em] text-[#4f4a3f]">AWAITING UPLINK…</p>
                ) : (
                  feed.map((f) => <FeedLine key={f.id} f={f} />)
                )}
              </div>
            )}
          </div>

          {/* Conversation */}
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="mb-4 flex justify-end">
                  <div className="ticks max-w-[85%] border border-[rgba(255,196,120,0.2)] bg-[rgba(255,180,84,0.06)] px-4 py-2.5 text-[0.88rem] leading-relaxed text-[#e8dfd0]">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="md mb-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ),
            )}

            {streamingText ? (
              <div className="md stream-caret mb-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
              </div>
            ) : (
              isStreaming && (
                <div className="sweep-line flex items-center gap-3 border border-[rgba(255,196,120,0.12)] px-4 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a89e8c]">{phase}</span>
                </div>
              )
            )}
          </div>

          {/* Composer */}
          <form onSubmit={submit} className="hairline-t p-4">
            <div className="ticks flex items-center gap-2 border border-[rgba(255,196,120,0.16)] bg-[rgba(6,6,10,0.6)] px-3.5 py-2.5 transition-colors focus-within:border-[rgba(255,196,120,0.45)]">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={isStreaming ? "ASTRO is working…" : `Ask about ${target}…`}
                disabled={isStreaming}
                maxLength={2000}
                className="flex-1 bg-transparent text-[0.88rem] text-[#f0eadf] placeholder-[#5f5849] outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isStreaming}
                aria-label="Transmit"
                className="flex h-7 w-9 shrink-0 items-center justify-center border border-[rgba(255,196,120,0.35)] bg-[rgba(255,180,84,0.12)] text-[#ffb454] transition-colors hover:bg-[rgba(255,180,84,0.22)] disabled:opacity-30"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
                </svg>
              </button>
            </div>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
