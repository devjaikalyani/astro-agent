"use client";

import { MotionConfig } from "framer-motion";

// Globally honours the user's "reduce motion" OS setting — Framer Motion
// will skip transforms and only cross-fade when reducedMotion is requested.
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
