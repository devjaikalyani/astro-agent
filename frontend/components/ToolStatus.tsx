"use client";

import { TOOL_LABELS } from "@/lib/types";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface ToolStatusProps {
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

export default function ToolStatus({ toolCalls, isStreaming }: ToolStatusProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {toolCalls.map((tc, i) => {
        const isLast = i === toolCalls.length - 1;
        const isActive = isLast && isStreaming;

        const queryValue =
          (tc.input.query as string) ||
          (tc.input.name as string) ||
          (tc.input.body1 ? `${tc.input.body1} vs ${tc.input.body2}` : null) ||
          (tc.input.value_hint as string) ||
          (tc.input.object_type as string) ||
          "";

        return (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all duration-300 ${
              isActive
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-blue-500/20 bg-blue-900/20 text-blue-400"
            }`}
          >
            {isActive && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
            {!isActive && (
              <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            <span>{TOOL_LABELS[tc.name] ?? tc.name}</span>
            {queryValue && (
              <span className="opacity-60 max-w-[120px] truncate">
                &quot;{queryValue}&quot;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
