import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Top masthead */}
      <header className="rule-b">
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-2xl tracking-tight">FlowFi</span>
            <span className="eyebrow">London · Apr 30 · 2026</span>
          </div>
          <div className="eyebrow">Cursor × Briefcase Hackathon</div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-8 py-20 grid grid-cols-12 gap-8 items-end rise rise-1">
        <div className="col-span-12 md:col-span-8">
          <p className="eyebrow mb-6">Track 02 · Financial Intelligence</p>
          <h1 className="font-serif text-[64px] leading-[1.05] tracking-tight">
            The agent that knows
            <br />
            <em className="not-italic" style={{ color: "var(--signal)" }}>when not</em> to decide.
          </h1>
          <p className="mt-8 max-w-[560px] text-lg leading-[1.55] text-[color:var(--ink)]/80">
            FlowFi underwrites B2B invoices in seconds by synthesising the supplier's ledger,
            live company-health signals from <span className="font-mono text-sm">Specter</span>, and
            UK statutory filings. It approves the easy ones, declines the obvious ones, and escalates
            the borderline cases — with the reasoning a human credit analyst can actually verify.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4">
          <div className="hair-t hair-b py-6">
            <p className="eyebrow mb-3">The thesis</p>
            <p className="font-serif text-xl leading-snug">
              Human-out-of-the-loop fails when the agent doesn't know what it doesn't know. Confidence
              calibration is the product.
            </p>
          </div>
        </div>
      </section>

      {/* Entry points */}
      <section className="max-w-[1200px] mx-auto px-8 pb-24 grid grid-cols-12 gap-6">
        <Link
          href="/supplier"
          className="col-span-12 md:col-span-6 group block rule-t pt-6 pb-8 hover:bg-soft transition rise rise-2"
        >
          <div className="flex items-baseline justify-between mb-6">
            <span className="eyebrow">View 01</span>
            <span className="font-mono text-xs text-muted">/supplier</span>
          </div>
          <h2 className="font-serif text-3xl leading-tight mb-3">Supplier console</h2>
          <p className="text-[color:var(--ink)]/70 mb-6 leading-snug">
            Acme Marketing has three outstanding invoices. Pick one and request a cash advance. Watch the
            underwriting agent reason live.
          </p>
          <span className="font-mono text-sm group-hover:text-signal transition">Open console →</span>
        </Link>

        <Link
          href="/analyst"
          className="col-span-12 md:col-span-6 group block rule-t pt-6 pb-8 hover:bg-soft transition rise rise-3"
        >
          <div className="flex items-baseline justify-between mb-6">
            <span className="eyebrow">View 02</span>
            <span className="font-mono text-xs text-muted">/analyst</span>
          </div>
          <h2 className="font-serif text-3xl leading-tight mb-3">Credit analyst desk</h2>
          <p className="text-[color:var(--ink)]/70 mb-6 leading-snug">
            Cases the agent escalated. See exactly why it stopped, the conflicting signals, and override
            with a documented decision.
          </p>
          <span className="font-mono text-sm group-hover:text-signal transition">Open desk →</span>
        </Link>
      </section>

      <footer className="mt-auto rule-t">
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex justify-between items-baseline">
          <span className="eyebrow">FlowFi · Demo · Halkin Offices</span>
          <span className="font-mono text-xs text-muted">Built on Cursor · Specter MCP · Anthropic</span>
        </div>
      </footer>
    </main>
  );
}
