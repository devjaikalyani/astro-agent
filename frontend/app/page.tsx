"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import AstroSearch from "@/components/AstroSearch";
import ModelSelector, { MODELS } from "@/components/ModelSelector";
import BootSequence from "@/components/BootSequence";
import KnowledgeStats from "@/components/KnowledgeStats";
import { container, fadeUp, letter, letterContainer } from "@/lib/motion";

const SpaceBackground = dynamic(() => import("@/components/SpaceBackground"), { ssr: false });

const WORDMARK = "ASTRO".split("");

export default function Home() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const activeModel = MODELS.find((m) => m.id === selectedModel);

  // Magnetic pointer-tilt for the hero wordmark
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [10, -10]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-7, 7]), { stiffness: 120, damping: 18 });

  const handleQuery = useCallback(
    (query: string) => {
      router.push(`/explore/${encodeURIComponent(query)}?model=${encodeURIComponent(selectedModel)}`);
    },
    [router, selectedModel],
  );

  return (
    <main
      className="hud-frame relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      onPointerMove={(e) => {
        px.set(e.clientX / window.innerWidth - 0.5);
        py.set(e.clientY / window.innerHeight - 0.5);
      }}
    >
      <BootSequence />
      <SpaceBackground objectType={null} hasContent={false} />

      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,12,0.72) 100%)" }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1, background: "radial-gradient(ellipse 720px 460px at 50% 46%, rgba(0,2,12,0.72) 0%, rgba(0,2,12,0.35) 45%, transparent 72%)" }}
      />

      {/* Top status bar */}
      <motion.div
        className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="font-hud text-[10px] tracking-[0.3em] text-[#6e8cba]">ASTRO · AGENT ONLINE</span>
        </div>
        <div className="font-hud hidden text-[10px] tracking-[0.3em] text-[#46618c] sm:block">
          SIMBAD · EXOPLANET ARCHIVE · JPL HORIZONS · NASA ADS · MPC
        </div>
      </motion.div>

      {/* Centered content */}
      <motion.div
        className="relative z-10 flex w-full max-w-3xl flex-col items-center pt-10 text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div className="mb-6 flex items-center justify-center gap-4" variants={fadeUp}>
          <motion.span className="h-px origin-right bg-gradient-to-r from-transparent to-blue-500/50" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.3 }} style={{ width: 40 }} />
          <span className="eyebrow text-[10px]">Agentic Celestial Intelligence</span>
          <motion.span className="h-px origin-left bg-gradient-to-l from-transparent to-blue-500/50" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.3 }} style={{ width: 40 }} />
        </motion.div>

        <motion.h1
          className="astro-title mb-5 text-[clamp(4rem,15vw,9rem)] font-bold leading-none tracking-[-0.04em]"
          variants={letterContainer}
          style={{ rotateX, rotateY, transformPerspective: 900 }}
        >
          {WORDMARK.map((ch, i) => (
            <motion.span key={i} className="inline-block" variants={letter}>
              {ch}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p className="font-body mb-7 max-w-lg text-[0.98rem] font-light leading-relaxed tracking-wide text-[#90abd6]" variants={fadeUp}>
          An autonomous agent that recognizes any celestial body, interrogates live
          observatory networks, and permanently learns from every discovery it makes.
        </motion.p>

        <motion.div className="mb-8" variants={fadeUp}>
          <KnowledgeStats />
        </motion.div>

        <motion.div className="mb-6" variants={fadeUp}>
          <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
        </motion.div>

        <motion.div className="w-full" variants={fadeUp}>
          <AstroSearch onSubmit={handleQuery} isStreaming={false} />
        </motion.div>
      </motion.div>

      <motion.footer
        className="fixed bottom-0 left-0 right-0 z-20 px-6 pb-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.8 }}
      >
        <p className="font-hud text-[9px] uppercase tracking-[0.4em] text-[#3f5a85]">
          Powered by {activeModel?.label ?? "Llama 3.3 70B"} · {activeModel?.provider ?? "Groq"}
        </p>
      </motion.footer>
    </main>
  );
}
