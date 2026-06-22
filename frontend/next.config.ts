import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The repo root has its own package.json (concurrently/nodemon), so Next
  // detects multiple lockfiles. Pin the trace root to this frontend app.
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["192.168.1.4", "192.168.0.0/16", "10.0.0.0/8"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
