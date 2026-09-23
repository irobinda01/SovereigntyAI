import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { analyzeProtocol } from "../src/analysis/strategyAnalysis";
import { config } from "../src/config";
import { EcosystemProtocol } from "../src/data/ecosystemProtocols";

const protocol: EcosystemProtocol = {
  id: "test-protocol",
  name: "Test Protocol",
  category: "Lending",
  website: "https://example-real-site.com",
  description: "A test protocol for unit testing.",
  plainSummary: "A made-up protocol used only for unit tests.",
  howItWorks: ["It does not exist.", "It is only used to test the analysis fallback."],
  risks: ["None — this is a test fixture, not a real protocol."],
  mainnetContract: "SP000000000000000000002Q6VF78.definitely-not-a-real-contract",
};

describe("analyzeProtocol", () => {
  const originalKey = config.anthropicApiKey;

  beforeEach(() => {
    (config as { anthropicApiKey?: string }).anthropicApiKey = undefined;
  });
  afterEach(() => {
    (config as { anthropicApiKey?: string }).anthropicApiKey = originalKey;
  });

  it("falls back to deterministic text when no API key is configured, never fabricating a number", async () => {
    const result = await analyzeProtocol(protocol);
    expect(result.protocolId).toBe("test-protocol");
    expect(result.analysis).toContain("Test Protocol");
    expect(result.analysis).not.toMatch(/\d+(\.\d+)?%\s*apy/i);
    expect(result.caveats).toMatch(/no apy/i);
  });

  it("reports contractExists: false for a contract that does not exist on-chain", async () => {
    const result = await analyzeProtocol(protocol);
    expect(result.contractExists).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("never asserts a specific TVL/APY figure as verified when unconfigured", async () => {
    const result = await analyzeProtocol(protocol);
    // The fallback path is fully deterministic and grounded only in the
    // protocol's own static description — spot check it names no numbers
    // that weren't in that description.
    expect(result.analysis).not.toMatch(/\$[\d,]+/);
  });
});
