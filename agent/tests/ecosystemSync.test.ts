import { describe, it, expect } from "vitest";
import { ECOSYSTEM_PROTOCOLS } from "../src/data/ecosystemProtocols";
import { ECOSYSTEM_PROTOCOLS as WEB_PROTOCOLS } from "../../apps/web/src/lib/ecosystemProtocols";

// The web app serves the ecosystem list from its own mirror
// (apps/web/src/lib/ecosystemProtocols.ts) so the home page works without the
// agent. This keeps the two from drifting apart: deep equality, field by field.
describe("ecosystem protocol list mirror", () => {
  it("the web mirror is identical to the agent's list", () => {
    expect(WEB_PROTOCOLS).toEqual(ECOSYSTEM_PROTOCOLS);
  });

  it("every entry has a mainnet contract and plain-language copy", () => {
    for (const p of WEB_PROTOCOLS) {
      expect(p.mainnetContract).toMatch(/^SP[0-9A-Z]+\.[a-z0-9-]+$/i);
      expect(p.plainSummary.length).toBeGreaterThan(20);
      expect(p.risks.length).toBeGreaterThan(0);
    }
  });
});
