"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/docs";

function score(entry: SearchEntry, terms: string[]): number {
  const title = entry.docTitle.toLowerCase();
  const heading = (entry.heading ?? "").toLowerCase();
  const text = entry.text.toLowerCase();
  let total = 0;
  for (const t of terms) {
    let s = 0;
    if (heading.includes(t)) s += 8;
    if (title.includes(t)) s += 4;
    if (text.includes(t)) s += 1;
    if (s === 0) return 0; // every term must match somewhere
    total += s;
  }
  return total;
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 40);
  return (start > 0 ? "..." : "") + text.slice(start, start + 140) + (start + 140 < text.length ? "..." : "");
}

export function SearchDialog({ index, open, onClose }: { index: SearchEntry[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => {
    if (terms.length === 0) return index.filter((e) => e.heading === null).slice(0, 8);
    return index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.e);
  }, [index, terms]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  function go(entry: SearchEntry) {
    onClose();
    router.push(`/docs/${entry.slug}${entry.anchor ? `#${entry.anchor}` : ""}`);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search documentation">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted" aria-hidden>
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && results[cursor]) go(results[cursor]);
            }}
            placeholder="Search the docs: receipt shares, testnet gate, post-conditions..."
            className="w-full bg-transparent py-4 text-sm text-foreground outline-none placeholder:text-muted-2"
          />
          <kbd className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;.</li>}
          {results.map((r, i) => (
            <li key={`${r.slug}#${r.anchor ?? ""}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseMove={() => setCursor(i)}
                onClick={() => go(r)}
                className={`block w-full rounded-lg px-3 py-2.5 text-left ${i === cursor ? "bg-surface-raised" : ""}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {r.heading ?? r.docTitle}
                  {r.heading && <span className="text-xs font-normal text-muted">in {r.docTitle}</span>}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{terms.length > 0 ? snippet(r.text, terms) : r.text}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
