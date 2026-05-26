import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          950: "#00000f",
          900: "#00010f",
          800: "#010218",
          700: "#020524",
        },
        nebula: {
          blue: "#1a6fff",
          purple: "#8b2fc9",
          cyan: "#00d4ff",
          gold: "#ffb830",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "cursor-blink": "cursor 1s step-end infinite",
        "fade-in": "fadeIn 0.5s ease-in",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        glow: {
          from: { boxShadow: "0 0 10px #1a6fff44, 0 0 20px #1a6fff22" },
          to: { boxShadow: "0 0 20px #1a6fff88, 0 0 40px #1a6fff44" },
        },
        cursor: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
