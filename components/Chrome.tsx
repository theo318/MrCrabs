"use client";

import Link from "next/link";

export function Topbar({ active }: { active: "supplier" | "analyst" }) {
  return (
    <header className="rule-b">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-baseline justify-between">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl tracking-tight">FlowFi</span>
          <span className="eyebrow hidden md:block">Agentic invoice finance</span>
        </Link>
        <nav className="flex items-baseline gap-6">
          <Link
            href="/supplier"
            className={`eyebrow ${active === "supplier" ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            01 Supplier
          </Link>
          <Link
            href="/analyst"
            className={`eyebrow ${active === "analyst" ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            02 Analyst
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 rule-t">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex justify-between items-baseline">
        <span className="eyebrow">FlowFi · Demo</span>
        <span className="font-mono text-xs text-muted">Cursor SDK · Specter · Anthropic</span>
      </div>
    </footer>
  );
}
