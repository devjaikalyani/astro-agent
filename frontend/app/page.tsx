"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AstroSearch from "@/components/AstroSearch";
import ModelSelector, { MODELS } from "@/components/ModelSelector";
import { useState } from "react";

const SpaceBackground = dynamic(() => import("@/components/SpaceBackground"), {
  ssr: false,
});

export default function Home() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const activeModel = MODELS.find((m) => m.id === selectedModel);

  const handleQuery = useCallback((query: string) => {
    router.push(`/explore/${encodeURIComponent(query)}?model=${encodeURIComponent(selectedModel)}`);
  }, [router, selectedModel]);

  return (
    <main className="relative min-h-screen flex flex-col">
      {/* Three.js canvas background — idle, sphere centered */}
      <SpaceBackground objectType={null} hasContent={false} />

      {/* Overlay gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,15,0.6) 100%)",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col min-h-screen px-4 py-8 items-center justify-center" style={{ zIndex: 2 }}>
        {/* Header */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-8 h-0.5 bg-gradient-to-r from-transparent to-blue-500" />
            <span className="text-xs tracking-[0.4em] text-blue-400 uppercase font-semibold">
              Celestial Intelligence
            </span>
            <div className="w-8 h-0.5 bg-gradient-to-l from-transparent to-blue-500" />
          </div>
          <h1 className="text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 mb-2">
            ASTRO
          </h1>
          <p className="text-[#4466aa] text-sm tracking-wide max-w-md mx-auto">
            Explore every planet, star, nebula, black hole, and natural body in the universe
          </p>
        </header>

        {/* Model selector */}
        <ModelSelector
          selected={selectedModel}
          onChange={setSelectedModel}
          disabled={false}
        />

        {/* Search */}
        <div className="w-full mb-8">
          <AstroSearch onSubmit={handleQuery} isStreaming={false} />
        </div>

        {/* Footer */}
        <footer className="text-center mt-4">
          <p className="text-[#2a3a5a] text-xs tracking-widest">
            POWERED BY {activeModel?.label.toUpperCase() ?? "LLAMA 3.3 70B"} — {activeModel?.provider.toUpperCase() ?? "GROQ"}
          </p>
        </footer>
      </div>
    </main>
  );
}
