import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DOCS, docNeighbours, getDocMeta, parseDoc, readDocSource, readingMinutes } from "@/lib/docs";
import { Markdown } from "@/components/docs/Markdown";
import { Toc } from "@/components/docs/Toc";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const meta = getDocMeta(slug);
  return meta ? { title: `${meta.title} - SovereigntyAI Docs`, description: meta.summary } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = getDocMeta(slug);
  if (!meta) notFound();

  const source = readDocSource(meta);
  const { body, headings } = parseDoc(source);
  const { prev, next } = docNeighbours(slug);
  const minutes = readingMinutes(body);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
      <article className="min-w-0 py-10 lg:py-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <span aria-hidden>/</span>
          <span>{meta.group}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{meta.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{meta.summary}</p>
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-2">
          <span>{minutes} min read</span>
          <span aria-hidden>·</span>
          <span>Source: docs/{meta.file}</span>
        </div>

        <div className="mt-8 max-w-3xl border-t border-border pt-2">
          <Markdown source={body} headings={headings} />
        </div>

        <nav aria-label="Pagination" className="mt-16 grid max-w-3xl gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="rounded-xl border border-border p-4 transition-colors hover:border-border-strong">
              <div className="text-xs text-muted">&larr; Previous</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{prev.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="rounded-xl border border-border p-4 text-right transition-colors hover:border-border-strong sm:col-start-2"
            >
              <div className="text-xs text-muted">Next &rarr;</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{next.title}</div>
            </Link>
          )}
        </nav>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto py-12">
          <Toc items={headings} />
        </div>
      </aside>
    </div>
  );
}
