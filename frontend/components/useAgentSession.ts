"use client";

// The agent session hook: owns the conversation, the live mission feed,
// and the SSE stream lifecycle. Presentation lives in AgentDock.

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentEvent, ChatMessage, streamAgent } from "@/lib/api";

export interface FeedEntry {
  id: number;
  kind: "tool" | "memory" | "info" | "error";
  label: string;
  detail?: string;
  source?: string;
  state: "running" | "done";
}

export interface AgentSession {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  phase: string;
  feed: FeedEntry[];
  ask: (query: string) => void;
  stop: () => void;
}

export function useAgentSession(
  model: string,
  onRecognition?: (body: { scene: string | null; name: string | null; solar_body: string | null }) => void,
): AgentSession {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [phase, setPhase] = useState("");
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const feedIdRef = useRef(0);
  const toolIdsRef = useRef<Map<string, number>>(new Map());
  const recognitionRef = useRef(onRecognition);

  useEffect(() => {
    recognitionRef.current = onRecognition;
  }, [onRecognition]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const commit = useCallback((msg: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, msg];
    setMessages(messagesRef.current);
  }, []);

  const addFeed = useCallback((entry: Omit<FeedEntry, "id">): number => {
    const id = ++feedIdRef.current;
    setFeed((prev) => [...prev.slice(-50), { ...entry, id }]);
    return id;
  }, []);

  const ask = useCallback(
    (query: string) => {
      const history = [...messagesRef.current];
      commit({ role: "user", content: query });
      setStreamingText("");
      setIsStreaming(true);
      setPhase("Connecting to ASTRO");
      abortRef.current?.abort();

      let acc = "";
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (acc) commit({ role: "assistant", content: acc });
        setStreamingText("");
        setIsStreaming(false);
      };

      abortRef.current = streamAgent({
        query,
        model,
        history,
        onEvent: (ev: AgentEvent) => {
          if (ev.e === "recognition") {
            recognitionRef.current?.({
              scene: ev.body.scene,
              name: ev.body.name,
              solar_body: ev.body.solar_body,
            });
            if (ev.body.object_type) {
              addFeed({
                kind: "info",
                label: "Object recognized",
                detail: `${ev.body.name ?? query} — ${ev.body.object_type.replace(/_/g, " ")}`,
                source: "ASTRO CORE",
                state: "done",
              });
            }
          } else if (ev.e === "phase") {
            setPhase(ev.label);
          } else if (ev.e === "recalled") {
            addFeed({ kind: "memory", label: "Memory recalled", detail: ev.detail, source: "MEMORY", state: "done" });
          } else if (ev.e === "tool") {
            const id = addFeed({ kind: "tool", label: ev.label, source: ev.source, state: "running" });
            toolIdsRef.current.set(ev.id, id);
            setPhase(ev.label);
          } else if (ev.e === "tool_done") {
            const fid = toolIdsRef.current.get(ev.id);
            if (fid !== undefined) {
              setFeed((prev) => prev.map((f) => (f.id === fid ? { ...f, state: "done" as const, detail: ev.summary } : f)));
              toolIdsRef.current.delete(ev.id);
            }
          } else if (ev.e === "learned") {
            addFeed({ kind: "memory", label: "Fact learned", detail: ev.fact, source: "MEMORY", state: "done" });
          } else if (ev.e === "delta") {
            acc += ev.t;
            setStreamingText(acc);
            setPhase("Composing analysis");
          } else if (ev.e === "fault") {
            addFeed({ kind: "error", label: "Transmission error", detail: ev.message, state: "done" });
            acc = acc ? `${acc}\n\n*${ev.message}*` : `*${ev.message}*`;
            setStreamingText(acc);
          } else if (ev.e === "complete") {
            finish();
          }
        },
        onClose: finish,
      });
    },
    [model, commit, addFeed],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { messages, streamingText, isStreaming, phase, feed, ask, stop };
}
