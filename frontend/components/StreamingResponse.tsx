"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ToolStatus from "./ToolStatus";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface StreamingResponseProps {
  text: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
  objectName: string | null;
}

export default function StreamingResponse({
  text,
  toolCalls,
  isStreaming,
  objectName,
}: StreamingResponseProps) {
  if (toolCalls.length === 0 && !text && !isStreaming) return null;

  return (
    <div className="w-full max-w-3xl mx-auto animate-slide-up">
      <div className="glass-card rounded-2xl p-6">
        {/* Object label */}
        {objectName && (
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-[rgba(26,111,255,0.1)]">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse-slow" />
            <span className="text-xs text-cyan-400 font-semibold tracking-widest uppercase">
              {objectName}
            </span>
          </div>
        )}

        {/* Tool calls */}
        <ToolStatus toolCalls={toolCalls} isStreaming={isStreaming && !text} />

        {/* Streaming text */}
        {text ? (
          <div className={`astro-response ${isStreaming ? "streaming-cursor" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : isStreaming && toolCalls.length > 0 ? (
          <div className="flex items-center gap-3 text-sm text-[#4466aa] py-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            Consulting stellar database...
          </div>
        ) : null}
      </div>
    </div>
  );
}
