import path from "node:path";
import type { NextConfig } from "next";

// Packages imported by agent/src (which lives outside this app). Bare imports
// resolve by walking up from the importing file, which never reaches
// apps/web/node_modules, so on a build that only installs the web app (e.g.
// Vercel with root directory apps/web) they would be "module not found".
// Alias them to this app's copies; keep in sync with the imports in agent/src
// reachable from src/lib/server/agentCore.ts.
// (Subpath imports need their own entry; an alias on the bare name does not cover them.)
const AGENT_DEPS = ["@anthropic-ai/sdk", "@stacks/transactions", "dotenv", "dotenv/config"];

const nextConfig: NextConfig = {
  // Monorepo: the bundler root is the repo root so server routes can reuse the
  // agent's real pipeline (agent/src) in-process (see src/lib/server/agentCore.ts).
  turbopack: {
    root: path.join(__dirname, "..", ".."),
    resolveAlias: Object.fromEntries(
      AGENT_DEPS.map((dep) => [dep, `./node_modules/${dep}`]),
    ),
  },
};

export default nextConfig;
