import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // strategyAnalysis.test.ts talks to live third-party APIs (Hiro mainnet,
    // DefiLlama, CoinGecko), which can be slow or rate-limited.
    testTimeout: 20_000,
  },
});
