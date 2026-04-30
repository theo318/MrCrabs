"use client";

import Link from "next/link";

export function Topbar() {
  return (
    <header className="rule-b">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-baseline justify-between">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl tracking-tight">Mr Crabs</span>
          <span className="eyebrow hidden md:block">Analyst console</span>
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 rule-t">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex justify-between items-baseline">
        <span className="eyebrow">Mr Crabs · Demo</span>
        <span className="font-mono text-xs text-muted">Cursor SDK · Specter · Anthropic</span>
      </div>
    </footer>
  );
}
