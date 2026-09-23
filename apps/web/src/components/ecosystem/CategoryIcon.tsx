import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  "DEX / AMM": (
    <path
      d="M2 5.5h9M11 5.5L8 2.5M11 5.5L8 8.5M14 10.5H5M5 10.5l3-3M5 10.5l3 3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  Lending: (
    <>
      <rect x="2" y="6.5" width="12" height="7" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 9h12M5.5 6.5V5a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  "CDP / Stablecoin": (
    <path
      d="M8 1.5l5.5 2.2v3.3c0 3.4-2.3 6.2-5.5 7.5-3.2-1.3-5.5-4.1-5.5-7.5V3.7L8 1.5z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  ),
  "Liquid Staking": (
    <>
      <path d="M8 2l6 3.2v5.6L8 14 2 10.8V5.2L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.3L11 8 8 9.7 5 8 8 6.3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </>
  ),
  "Synthetic Dollar": (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.5v7M6 6.2c0-.9.9-1.5 2-1.5s2 .6 2 1.5-.9 1.3-2 1.5c-1.1.2-2 .6-2 1.5S6.9 10.7 8 10.7s2-.6 2-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const icon = ICONS[category];
  if (!icon) return null;
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      {icon}
    </svg>
  );
}
