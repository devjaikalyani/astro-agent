"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AstroSearch from "@/components/AstroSearch";
import ModelSelector, { MODELS } from "@/components/ModelSelector";

const SpaceBackground = dynamic(() => import("@/components/SpaceBackground"), {
  ssr: false,
});

export default function Home() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const activeModel = MODELS.find((m) => m.id === selectedModel);

  const handleQuery = useCallback(
    (query: string) => {
      router.push(
        `/explore/${encodeURIComponent(query)}?model=${encodeURIComponent(selectedModel)}`,
      );
    },
    [router, selectedModel],
  );

  return (
    <main className="relative min-h-screen flex flex-col">
      <SpaceBackground objectType={null} hasContent={false} />

      {/* Edge vignette — frames the scene */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 62%, transparent 22%, rgba(0,0,15,0.70) 100%)",
          zIndex: 1,
        }}
      />

      {/* Stage light — darkens center behind content so text always reads cleanly */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 740px 520px at 50% 52%, rgba(0,4,20,0.62) 0%, transparent 100%)",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        className="relative w-full flex flex-col min-h-screen px-6 pb-16 justify-center"
        style={{ zIndex: 2 }}
      >
        {/* Header */}
        <header className="w-full text-center mb-10 entry-0">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="w-10 h-px bg-gradient-to-r from-transparent to-blue-500/50" />
            <span className="font-hud text-[9px] tracking-[0.55em] text-blue-400/70 uppercase font-medium">
              Celestial Intelligence
            </span>
            <div className="w-10 h-px bg-gradient-to-l from-transparent to-blue-500/50" />
          </div>
          <h1 className="text-[5.5rem] leading-none font-bold tracking-[-0.03em] astro-title mb-4">
            ASTRO
          </h1>
          <p className="text-[#7a9ac8] text-[0.9rem] font-light max-w-xs mx-auto leading-relaxed tracking-wide">
            Explore every planet, star, nebula,<br className="hidden sm:block" /> black hole, and natural body in the universe
          </p>
        </header>

        {/* Model selector */}
        <div className="w-full flex justify-center entry-1">
          <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
        </div>

        {/* Search */}
        <div className="w-full entry-2">
          <AstroSearch onSubmit={handleQuery} isStreaming={false} />
        </div>

        {/* Footer */}
        <footer className="w-full text-center mt-6 entry-3">
          <p className="font-hud text-[#3d5a85] text-[9px] tracking-[0.5em] uppercase">
            Powered by {activeModel?.label ?? "Llama 3.3 70B"} &middot; {activeModel?.provider ?? "Groq"}
          </p>
        </footer>
      </div>
    </main>
  );
}
