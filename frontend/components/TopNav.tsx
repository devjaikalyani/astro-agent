"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODELS } from "@/lib/api";

const LINKS = [
  { href: "/", label: "UNIVERSE" },
  { href: "/journeys", label: "JOURNEYS" },
  { href: "/observatory", label: "OBSERVATORY" },
];

interface TopNavProps {
  model?: string;
  onModelChange?: (m: string) => void;
}

export default function TopNav({ model, onModelChange }: TopNavProps) {
  const pathname = usePathname();

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between px-5 py-3.5 sm:px-7">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-sm font-medium tracking-[0.28em] text-[#f0eadf]">ASTRO</span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <span className="blink-dot h-1 w-1 rounded-full bg-[#ffb454]" />
          <span className="font-mono text-[8px] tracking-[0.32em] text-[#6b6355]">AGENT ONLINE</span>
        </span>
      </Link>

      <nav className="panel flex items-center gap-0 rounded-full px-1 py-1">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={[
                "rounded-full px-3.5 py-1.5 font-mono text-[9.5px] tracking-[0.24em] transition-colors sm:px-5",
                active ? "bg-[rgba(255,180,84,0.14)] text-[#ffb454]" : "text-[#a89e8c] hover:text-[#f0eadf]",
              ].join(" ")}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      {model !== undefined && onModelChange ? (
        <div className="panel flex items-center gap-2 rounded-full py-1.5 pl-3 pr-2">
          <span className="hidden font-mono text-[8px] tracking-[0.28em] text-[#6b6355] md:inline">MODEL</span>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="cursor-pointer bg-transparent font-mono text-[10px] tracking-wide text-[#f0eadf] outline-none [&>option]:bg-[#0b0c11]"
            aria-label="Select model"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <span className="w-[90px]" />
      )}
    </header>
  );
}
