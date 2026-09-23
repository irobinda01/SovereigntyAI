"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { SearchEntry } from "@/lib/docs";
import { SearchDialog } from "./SearchDialog";

export interface NavGroup {
  group: string;
  docs: Array<{ slug: string; title: string }>;
}

/**
 * Documentation frame: sticky grouped sidebar on desktop, collapsible menu on
 * mobile, and a global search palette (Ctrl/Cmd+K, or "/").
 */
export function DocsShell({ groups, index, children }: { groups: NavGroup[]; index: SearchEntry[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const onKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSearchOpen(true);
    } else if (e.key === "/" && !typing) {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const nav = (
    <nav aria-label="Documentation" className="space-y-6">
      <Link
        href="/docs"
        className={clsx(
          "block rounded-md px-3 py-1.5 text-sm font-medium",
          pathname === "/docs" ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
        )}
      >
        Overview
      </Link>
      {groups.map((g) => (
        <div key={g.group}>
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">{g.group}</div>
          <ul className="mt-2 space-y-0.5">
            {g.docs.map((d) => {
              const active = pathname === `/docs/${d.slug}`;
              return (
                <li key={d.slug}>
                  <Link
                    href={`/docs/${d.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "block rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-accent bg-surface-raised font-medium text-foreground"
                        : "border-transparent text-muted hover:bg-surface-raised/60 hover:text-foreground"
                    )}
                  >
                    {d.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const searchButton = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="flex w-full items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-left text-sm text-muted transition-colors hover:border-muted-2"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="flex-1">Search docs</span>
      <kbd className="rounded border border-border-strong px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl px-6">
      {/* mobile bar */}
      <div className="sticky top-[57px] z-30 -mx-6 border-b border-border bg-background/90 px-6 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-foreground"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <div className="flex-1">{searchButton}</div>
        </div>
        {menuOpen && <div className="mt-4 max-h-[60vh] overflow-y-auto pb-2">{nav}</div>}
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto py-10 pr-2">
            {searchButton}
            {nav}
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>

      <SearchDialog index={index} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
