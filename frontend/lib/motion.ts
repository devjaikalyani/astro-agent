// Motion design system for ASTRO — shared Framer Motion variants and springs.
// Follows pro motion rules: ease-out entrances, ease-in (shorter) exits,
// transform/opacity-first, spring physics, and respect for reduced motion
// (handled globally via <MotionProvider reducedMotion="user">).

import type { Transition, Variants } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 240, damping: 24, mass: 0.9 };
export const softSpring: Transition = { type: "spring", stiffness: 150, damping: 22 };
export const snappy: Transition = { type: "spring", stiffness: 420, damping: 30 };

// Entrance: ease-out (quick start, gentle settle)
export const easeOut: Transition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };
// Exit: ease-in, ~60% shorter than entrance
export const easeIn: Transition = { duration: 0.18, ease: [0.4, 0, 1, 1] };

// Orchestration container — staggers its children in
export const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { ...easeOut, duration: 0.75 } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeOut },
};

// Popover / dropdown: spring-scale from its anchor, snappy ease-in exit
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.96, y: -8, transition: easeIn },
};

// Side drawer: slide + fade, exit shorter
export const drawer: Variants = {
  hidden: { x: "100%", opacity: 0.5 },
  show: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 30 } },
  exit: { x: "100%", opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: easeIn },
};

// Per-letter wordmark reveal (3D flip up). Parent needs perspective.
export const letter: Variants = {
  hidden: { opacity: 0, y: "0.55em", rotateX: -55 },
  show: { opacity: 1, y: 0, rotateX: 0, transition: { type: "spring", stiffness: 200, damping: 18 } },
};

export const letterContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

// Shared press/hover micro-interactions for interactive chips & buttons
export const tap = { scale: 0.96 } as const;
export const hoverLift = { y: -2 } as const;
