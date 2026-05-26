import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASTRO — Celestial Intelligence",
  description: "AI-powered astronomical knowledge engine. Explore planets, stars, nebulae, black holes and everything in space.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#00000f] text-[#e8eeff] antialiased">
        {children}
      </body>
    </html>
  );
}
