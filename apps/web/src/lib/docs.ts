import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Documentation is the repository's own `docs/*.md` - one source of truth, no
// copy. This module runs on the server only: it reads the files, derives the
// table of contents and the search index from the real text, and nothing here
// is hand-maintained beyond the registry below (title, group, one-line summary).

const DOCS_DIR = join(process.cwd(), "..", "..", "docs");

export interface DocMeta {
  slug: string;
  title: string;
  group: string;
  summary: string;
  file: string;
}

export const DOC_GROUPS = ["Start here", "Protocol", "AI and strategies", "Operate", "Roadmap"] as const;

export const DOCS: DocMeta[] = [
  {
    slug: "user-guide",
    title: "User Guide",
    group: "Start here",
    summary: "Connect, create a treasury, deposit, get AI recommendations, redeem. The full UI flow, step by step.",
    file: "user-guide.md",
  },
  {
    slug: "vault-architecture",
    title: "Vault Architecture",
    group: "Protocol",
    summary: "Multi-vault model, receipt shares, share pricing, the testnet execution gate, and the security review.",
    file: "vault-architecture.md",
  },
  {
    slug: "architecture",
    title: "Architecture",
    group: "Protocol",
    summary: "Layers, the contract dependency graph, and why the vault can never call an arbitrary contract.",
    file: "architecture.md",
  },
  {
    slug: "contracts",
    title: "Smart Contracts",
    group: "Protocol",
    summary: "Every contract, its public interface, error-code ranges and key invariants.",
    file: "contracts.md",
  },
  {
    slug: "security-model",
    title: "Security Model",
    group: "Protocol",
    summary: "Threat model, and what the admin, the AI executor and vault owners can never do.",
    file: "security-model.md",
  },
  {
    slug: "ai-agent",
    title: "AI Agent",
    group: "AI and strategies",
    summary: "How recommendations and intents are produced from real data, and how they are validated.",
    file: "ai-agent.md",
  },
  {
    slug: "strategies",
    title: "Strategies",
    group: "AI and strategies",
    summary: "What a strategy is, why none is registered on Testnet, and how a real one is added.",
    file: "strategies.md",
  },
  {
    slug: "testnet",
    title: "Testnet",
    group: "Operate",
    summary: "Real testnet assets, the verified sBTC contract, faucets and tooling.",
    file: "testnet.md",
  },
  {
    slug: "deployment",
    title: "Deployment",
    group: "Operate",
    summary: "Live contract addresses, real transaction ids, the acceptance run, and how to redeploy.",
    file: "deployment.md",
  },
  {
    slug: "future-roadmap",
    title: "Future Roadmap",
    group: "Roadmap",
    summary: "Out-of-scope modules and the extension points prepared for them.",
    file: "future-roadmap.md",
  },
];

export function getDocMeta(slug: string): DocMeta | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function docNeighbours(slug: string): { prev: DocMeta | null; next: DocMeta | null } {
  const i = DOCS.findIndex((d) => d.slug === slug);
  return { prev: i > 0 ? DOCS[i - 1] : null, next: i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : null };
}

export function docGroups(): Array<{ group: string; docs: DocMeta[] }> {
  return DOC_GROUPS.map((group) => ({ group, docs: DOCS.filter((d) => d.group === group) })).filter((g) => g.docs.length > 0);
}

// ------------------------------------------------------------------ reading

const cache = new Map<string, string>();

export function readDocSource(meta: DocMeta): string {
  const hit = cache.get(meta.file);
  if (hit !== undefined && process.env.NODE_ENV === "production") return hit;
  let text: string;
  try {
    text = readFileSync(join(DOCS_DIR, meta.file), "utf8");
  } catch {
    text = `# ${meta.title}\n\nThis documentation file could not be found (\`docs/${meta.file}\`).`;
  }
  cache.set(meta.file, text);
  return text;
}

// ------------------------------------------------------------------ structure

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

/** Plain text of a markdown fragment: strips code ticks, emphasis, links and images. */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

/** Splits the document into its title, body (without the H1) and its H2/H3 headings, ignoring fenced code. */
export function parseDoc(source: string): { title: string | null; body: string; headings: Heading[] } {
  const lines = source.split(/\r?\n/);
  let inFence = false;
  let title: string | null = null;
  const bodyLines: string[] = [];
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1 && title === null) {
        title = plainText(h1[1]);
        continue; // the page renders its own title
      }
      const h = line.match(/^(#{2,3})\s+(.+?)\s*$/);
      if (h) {
        const text = plainText(h[2]);
        let id = slugify(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n > 0) id = `${id}-${n}`;
        headings.push({ level: h[1].length as 2 | 3, text, id });
      }
    }
    bodyLines.push(line);
  }
  return { title, body: bodyLines.join("\n"), headings };
}

export function readingMinutes(md: string): number {
  const words = plainText(md).split(" ").length;
  return Math.max(1, Math.round(words / 200));
}

// ------------------------------------------------------------------ search

export interface SearchEntry {
  slug: string;
  docTitle: string;
  group: string;
  heading: string | null; // null = the document as a whole
  anchor: string | null;
  text: string;
}

/** One entry per document section, built from the real text so search can never drift from the docs. */
export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const meta of DOCS) {
    const source = readDocSource(meta);
    const { body, headings } = parseDoc(source);
    entries.push({
      slug: meta.slug,
      docTitle: meta.title,
      group: meta.group,
      heading: null,
      anchor: null,
      text: meta.summary,
    });

    // Split body into sections at H2/H3 (outside fences).
    const lines = body.split(/\r?\n/);
    let inFence = false;
    let hi = -1;
    let buf: string[] = [];
    const flush = () => {
      if (hi >= 0) {
        const text = plainText(buf.join(" ")).slice(0, 600);
        entries.push({
          slug: meta.slug,
          docTitle: meta.title,
          group: meta.group,
          heading: headings[hi].text,
          anchor: headings[hi].id,
          text,
        });
      }
      buf = [];
    };
    for (const line of lines) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (!inFence && /^#{2,3}\s+/.test(line)) {
        flush();
        hi++;
        continue;
      }
      buf.push(line);
    }
    flush();
  }
  return entries;
}
