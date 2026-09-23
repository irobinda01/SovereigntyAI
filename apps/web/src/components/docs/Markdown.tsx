import Link from "next/link";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOCS, type Heading } from "@/lib/docs";
import { CodeBlock } from "./CodeBlock";

const SLUGS = new Set(DOCS.map((d) => d.slug));

/** `./deployment.md#x`, `deployment.md`, `docs/deployment.md` -> `/docs/deployment#x`. Anything else is left alone. */
function resolveHref(href: string | undefined): { href: string; external: boolean } {
  if (!href) return { href: "#", external: false };
  if (/^https?:\/\//.test(href)) return { href, external: true };
  const m = href.match(/^(?:\.\/|docs\/|\.\.\/docs\/)?([a-z0-9-]+)\.md(#.*)?$/);
  if (m && SLUGS.has(m[1])) return { href: `/docs/${m[1]}${m[2] ?? ""}`, external: false };
  return { href, external: false };
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * Renders a docs page from its markdown with GFM (tables, task lists), stable
 * heading anchors that match the table of contents, internal-link rewriting,
 * copyable code blocks and callout blockquotes.
 */
export function Markdown({ source, headings }: { source: string; headings: Heading[] }) {
  // Headings render in document order, so a cursor per level finds the id that
  // parseDoc() assigned - guaranteeing anchors and the TOC always agree.
  let cursor = 0;
  const nextId = (level: 2 | 3, fallback: string) => {
    for (let i = cursor; i < headings.length; i++) {
      if (headings[i].level === level) {
        cursor = i + 1;
        return headings[i].id;
      }
    }
    return fallback;
  };

  const heading = (level: 2 | 3) =>
    function H({ children }: { children?: ReactNode }) {
      const id = nextId(level, textOf(children).toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const cls =
        level === 2
          ? "group mt-14 scroll-mt-28 border-t border-border pt-8 text-2xl font-semibold tracking-tight text-foreground"
          : "group mt-9 scroll-mt-28 text-lg font-semibold tracking-tight text-foreground";
      const Tag = level === 2 ? "h2" : "h3";
      return (
        <Tag id={id} className={cls}>
          <a href={`#${id}`} className="no-underline">
            {children}
            <span aria-hidden className="ml-2 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
              #
            </span>
          </a>
        </Tag>
      );
    };

  const components: Components = {
    h2: heading(2),
    h3: heading(3),
    h4: ({ children }) => <h4 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted">{children}</h4>,
    p: ({ children }) => <p className="my-4 leading-7 text-muted [&>strong]:text-foreground">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    a: ({ href, children }) => {
      const r = resolveHref(href);
      const cls = "font-medium text-accent underline-offset-4 hover:underline";
      return r.external ? (
        <a href={r.href} target="_blank" rel="noreferrer" className={cls}>
          {children}
        </a>
      ) : r.href.startsWith("/") ? (
        <Link href={r.href} className={cls}>
          {children}
        </Link>
      ) : (
        <a href={r.href} className={cls}>
          {children}
        </a>
      );
    },
    ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6 leading-7 text-muted marker:text-muted-2">{children}</ul>,
    ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6 leading-7 text-muted marker:text-muted-2">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    hr: () => <hr className="my-10 border-border" />,
    blockquote: ({ children }) => (
      <blockquote className="my-6 rounded-xl border border-accent/25 border-l-[3px] border-l-accent bg-accent/5 px-5 py-1 [&_p]:my-3 [&_p]:text-foreground/90">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => (
      <code
        className={
          className
            ? className
            : "rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        }
      >
        {children}
      </code>
    ),
    pre: ({ children }) => {
      const child = Array.isArray(children) ? children[0] : children;
      const el = isValidElement(child) ? (child as ReactElement<{ className?: string; children?: ReactNode }>) : null;
      const lang = el?.props.className?.replace("language-", "");
      const code = textOf(el?.props.children ?? children).replace(/\n$/, "");
      return <CodeBlock code={code} language={lang} />;
    },
    table: ({ children }) => (
      <div className="my-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-surface-raised text-xs uppercase tracking-wider text-muted">{children}</thead>,
    th: ({ children }) => <th className="whitespace-nowrap border-b border-border px-4 py-2.5 font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-border px-4 py-3 align-top leading-6 text-muted [&_strong]:text-foreground last:border-b-0">{children}</td>,
    tr: ({ children }) => <tr className="[&:last-child>td]:border-b-0">{children}</tr>,
  };

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{source}</ReactMarkdown>;
}
