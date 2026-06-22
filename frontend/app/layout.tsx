import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ASTRO — Celestial Intelligence",
  description: "AI-powered astronomical knowledge engine. Explore planets, stars, nebulae, black holes and everything in space.",
};

export const viewport: Viewport = {
  themeColor: "#00010a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[#00010a] text-[#eaf1ff] antialiased">
        {children}
      </body>
    </html>
  );
}
