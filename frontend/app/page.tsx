"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AstroSearch from "@/components/AstroSearch";
import ModelSelector, { MODELS } from "@/components/ModelSelector";

const SpaceBackground = dynamic(() => import("@/components/SpaceBackground"), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const activeModel = MODELS.find((m) => m.id === selectedModel);

  const handleQuery = useCallback(
    (query: string) => {
      router.push(`/explore/${encodeURIComponent(query)}?model=${encodeURIComponent(selectedModel)}`);
    },
    [router, selectedModel],
  );

  return (
    <main className="hud-frame relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <SpaceBackground objectType={null} hasContent={false} />

      {/* Vignette + stage light so centered text always reads cleanly */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,12,0.72) 100%)" }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse 760px 520px at 50% 48%, rgba(0,3,16,0.55) 0%, transparent 70%)" }}
      />

      {/* Top status bar */}
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="rise d1 flex items-center gap-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="font-hud text-[10px] tracking-[0.3em] text-[#6e8cba]">ASTRO · ONLINE</span>
        </div>
        <div className="rise d1 font-hud hidden text-[10px] tracking-[0.3em] text-[#46618c] sm:block">
          SIMBAD · EXOPLANET ARCHIVE · JPL HORIZONS
        </div>
      </div>

      {/* Centered content column */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <div className="rise d1 mb-6 flex items-center justify-center gap-4">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-blue-500/50" />
          <span className="eyebrow text-[10px]">Celestial Intelligence</span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-blue-500/50" />
        </div>

        <h1 className="astro-title rise d2 mb-5 text-[clamp(4rem,15vw,9rem)] font-bold leading-none tracking-[-0.04em]">
          ASTRO
        </h1>

        <p className="rise d3 font-body mb-10 max-w-md text-[0.98rem] font-light leading-relaxed tracking-wide text-[#90abd6]">
          An AI astronomer for every planet, star, nebula, black hole and natural body in the universe — streamed live from real observatory data.
        </p>

        <div className="rise d3 mb-6">
          <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
        </div>

        <div className="rise d4 w-full">
          <AstroSearch onSubmit={handleQuery} isStreaming={false} />
        </div>
      </div>

      {/* Footer */}
      <footer className="rise d5 fixed bottom-0 left-0 right-0 z-20 px-6 pb-6 text-center">
        <p className="font-hud text-[9px] uppercase tracking-[0.4em] text-[#3f5a85]">
          Powered by {activeModel?.label ?? "Llama 3.3 70B"} · {activeModel?.provider ?? "Groq"}
        </p>
      </footer>
    </main>
  );
}
