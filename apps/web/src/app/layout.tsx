import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-context";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme-context";
import { Nav } from "@/components/Nav";
import { NetworkStrip } from "@/components/NetworkStrip";
import { ChatWidget } from "@/components/chat/ChatWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SovereigntyAI",
  description: "AI proposes. Clarity enforces. You retain ownership. A non-custodial, AI-assisted STX and sBTC treasury protocol on Stacks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Runs before hydration so the correct theme is set before first paint — no flash. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <WalletProvider>
            <Nav />
            <NetworkStrip />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border py-8 text-center text-xs text-muted">
              SovereigntyAI - Stacks Testnet only, real testnet assets. Not audited. Not financial advice.
            </footer>
            <ChatWidget />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
