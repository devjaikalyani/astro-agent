"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const LINES = [
  "INITIALIZING ASTRO CORE",
  "CALIBRATING OPTICAL ARRAY",
  "LINKING SIMBAD · EXOPLANET ARCHIVE · JPL HORIZONS",
  "UPLINK ESTABLISHED",
];

// A brief, skippable cinematic boot overlay shown once per session. Plays
// over the live 3D starfield, then wipes away to reveal the home page.
export default function BootSequence() {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("astro-booted")) {
      setBooting(false);
      return;
    }
    const t = setTimeout(finish, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (typeof window !== "undefined") sessionStorage.setItem("astro-booted", "1");
    setBooting(false);
  };

  return (
    <AnimatePresence>
      {booting && (
        <motion.div
          key="boot"
          onClick={finish}
          className="fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(2,4,16,0.86) 0%, rgba(0,1,8,0.97) 70%)" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.06, filter: "blur(12px)", transition: { duration: 0.7, ease: [0.7, 0, 0.84, 0] } }}
        >
          {/* Pulsing reticle */}
          <motion.div
            className="relative mb-10 h-16 w-16"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
          >
            <motion.span
              className="absolute inset-0 rounded-full border border-cyan-400/40"
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
            <motion.span
              className="absolute inset-2 rounded-full border border-blue-400/30"
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <motion.span
                className="h-2 w-2 rounded-full bg-cyan-300"
                animate={{ scale: [1, 0.6, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </motion.div>

          {/* Status lines */}
          <motion.div
            className="flex flex-col items-center gap-2"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.42, delayChildren: 0.3 } } }}
          >
            {LINES.map((l, i) => (
              <motion.span
                key={l}
                className="font-hud text-[10px] tracking-[0.42em] text-[#6e9ad0] sm:text-[11px]"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: i === LINES.length - 1 ? 1 : 0.55, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
                }}
              >
                {l}
              </motion.span>
            ))}
          </motion.div>

          {/* Progress bar (scaleX — transform only) */}
          <div className="mt-9 h-px w-56 overflow-hidden bg-[rgba(120,180,255,0.14)]">
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-cyan-400 to-violet-400"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 2.0, ease: [0.4, 0, 0.2, 1] }}
            />
          </div>

          <motion.span
            className="font-hud absolute bottom-10 text-[9px] tracking-[0.4em] text-[#3f5a85]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 1.2 } }}
          >
            CLICK TO SKIP
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
