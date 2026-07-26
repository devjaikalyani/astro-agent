import type { Metadata, Viewport } from "next";
import { Unbounded, Sora, Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-unbounded",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-sora",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ASTRO: A Universe That Learns",
  description:
    "An autonomous astronomical intelligence living inside a navigable 3D universe. Fly between worlds, wake the agent, and watch it learn.",
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${sora.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-[#04050a] text-[#f0eadf] antialiased">{children}</body>
    </html>
  );
}
