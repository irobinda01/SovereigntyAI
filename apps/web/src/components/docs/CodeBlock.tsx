"use client";

import { useState } from "react";

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (insecure context): silently ignore
    }
  }

  return (
    <div className="group my-5 overflow-hidden rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>{language && language !== "text" ? language : "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
