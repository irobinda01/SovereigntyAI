"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

export interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

/** "On this page" with scroll-spy: highlights the section currently in view. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0) return;
    const elements = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => e !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost heading that is inside the reading band wins.
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -65% 0px", threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">On this page</div>
      <ul className="mt-3 space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={clsx(
                "-ml-px block border-l py-1 text-[13px] leading-snug transition-colors",
                item.level === 3 ? "pl-6" : "pl-3",
                active === item.id
                  ? "border-accent font-medium text-foreground"
                  : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
