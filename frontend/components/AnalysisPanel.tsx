"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/lib/types";

interface AnalysisPanelProps {
  objectName: string;
  objectClass: string;
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  status: string;
  onAsk: (question: string) => void;
  onClose: () => void;
}

const FOLLOW_UPS = ["How was it discovered?", "Latest research findings", "Compare it with Earth"];

// Persistent conversation panel: streamed markdown analysis plus a composer
// for follow-up questions that keep full conversational context.
export default function AnalysisPanel({
  objectName,
  objectClass,
  messages,
  streamingText,
  isStreaming,
  status,
  onAsk,
  onClose,
}: AnalysisPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Keep the view pinned to the newest text unless the user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || isStreaming) return;
    setDraft("");
    pinnedRef.current = true;
    onAsk(q);
  };

  const showFollowUps = !isStreaming && messages.length > 0 && !streamingText;

  return (
    <div className="glass-strong pointer-events-auto flex h-full flex-col border-l border-[rgba(120,180,255,0.12)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgba(120,180,255,0.1)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isStreaming ? "pulse-dot bg-cyan-400" : "bg-emerald-400"}`} />
          <span className="truncate text-sm font-semibold tracking-wide text-[#cfe2ff]">{objectName}</span>
          <span className="font-hud shrink-0 text-[9px] uppercase tracking-[0.2em] text-[#5a78a4]">{objectClass}</span>
        </div>
        <button
          type="button"
          aria-label="Collapse analysis panel"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#476394] transition-colors hover:bg-[rgba(120,180,255,0.1)] hover:text-[#cfe2ff]"
        >
          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="mb-4 flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[rgba(120,180,255,0.16)] bg-[rgba(40,80,160,0.18)] px-4 py-2.5 text-[0.9rem] leading-relaxed text-[#d5e4fb]">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="astro-response mb-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </div>
          ),
        )}

        {streamingText ? (
          <div className="astro-response streaming-cursor mb-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
          </div>
        ) : (
          isStreaming && (
            <div className="flex items-center gap-3 py-3">
              <span className="flex items-end gap-1" style={{ height: "1.3rem" }}>
                {[0, 120, 240].map((d) => (
                  <span
                    key={d}
                    className="w-[3px] animate-bounce rounded-full bg-blue-500/65"
                    style={{ height: d === 120 ? "1.2rem" : "0.75rem", animationDelay: `${d}ms` }}
                  />
                ))}
              </span>
              <span className="font-hud text-[11px] uppercase tracking-[0.22em] text-[#7593bd]">{status}</span>
            </div>
          )
        )}
      </div>

      {/* Follow-up suggestions */}
      {showFollowUps && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-1.5 px-5 pb-2"
        >
          {FOLLOW_UPS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onAsk(f)}
              className="font-hud rounded-full border border-[rgba(120,180,255,0.16)] bg-[rgba(10,20,44,0.5)] px-3 py-1 text-[10px] tracking-wide text-[#7d9bc8] transition-colors hover:border-[rgba(120,180,255,0.4)] hover:text-[#cfe2ff]"
            >
              {f}
            </button>
          ))}
        </motion.div>
      )}

      {/* Composer */}
      <form onSubmit={submit} className="border-t border-[rgba(120,180,255,0.1)] p-4">
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(120,180,255,0.14)] bg-[rgba(6,12,30,0.6)] px-3.5 py-2.5 transition-colors focus-within:border-[rgba(120,180,255,0.4)]">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={isStreaming ? "ASTRO is analyzing…" : "Ask a follow-up about this object…"}
            disabled={isStreaming}
            maxLength={2000}
            className="font-body flex-1 bg-transparent text-[0.9rem] text-[#dceaff] placeholder-[#4a6a9a] outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isStreaming}
            aria-label="Send follow-up"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_2px_14px_rgba(56,160,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
