import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: the bundler root is the repo root so server routes can reuse the
  // agent's real pipeline (agent/src) in-process (see src/lib/server/agentCore.ts).
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
