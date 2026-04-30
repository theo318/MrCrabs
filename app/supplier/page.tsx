"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SUPPLIER, getBuyer } from "@/lib/mock-data";
import type { Decision } from "@/lib/underwrite-prompt";
import { Topbar, Footer } from "@/components/Chrome";

type StreamState = {
  running: boolean;
  reasoning: string;
  context: any | null;
  decision: { case: any } | null;
  error: string | null;
};

const initialState: StreamState = {
  running: false,
  reasoning: "",
  context: null,
  decision: null,
  error: null,
};

export default function SupplierPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<StreamState>(initialState);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // autoscroll reasoning panel
  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [state.reasoning]);

  async function runUnderwriting(invoiceId: string) {
    setSelectedId(invoiceId);
    setState({ ...initialState, running: true });

    const res = await fetch("/api/underwrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });

    if (!res.body) {
      setState((s) => ({ ...s, running: false, error: "No stream" }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const ev of events) {
        const lines = ev.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;
        const eventName = eventLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim());

        if (eventName === "context") {
          setState((s) => ({ ...s, context: data }));
        } else if (eventName === "delta") {
          setState((s) => ({ ...s, reasoning: s.reasoning + data.text }));
        } else if (eventName === "decision") {
          setState((s) => ({ ...s, decision: data }));
        } else if (eventName === "error") {
          setState((s) => ({ ...s, error: data.message, running: false }));
        } else if (eventName === "done") {
          setState((s) => ({ ...s, running: false }));
        }
      }
    }
  }

  const selectedInvoice = selectedId
    ? SUPPLIER.outstanding.find((i) => i.id === selectedId)
    : null;
  const selectedBuyer = selectedInvoice ? getBuyer(selectedInvoice.buyerId) : null;

  // Strip the decision block from the streaming reasoning for nicer reading
  const displayedReasoning = state.reasoning.replace(/<<<DECISION[\s\S]*$/, "");

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar active="supplier" />

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-8 py-10 grid grid-cols-12 gap-8">
        {/* LEFT — invoice list */}
        <aside className="col-span-12 lg:col-span-4 rise rise-1">
          <div className="hair-b pb-3 mb-5 flex items-baseline justify-between">
            <p className="eyebrow">Outstanding invoices</p>
            <p className="font-mono text-xs text-muted">{SUPPLIER.outstanding.length} live</p>
          </div>

          <div className="space-y-1">
            {SUPPLIER.outstanding.map((inv) => {
              const buyer = getBuyer(inv.buyerId)!;
              const isSelected = selectedId === inv.id;
              return (
                <button
                  key={inv.id}
                  onClick={() => runUnderwriting(inv.id)}
                  disabled={state.running}
                  className={`w-full text-left p-4 border ${
                    isSelected ? "border-ink bg-soft" : "border-faint hover:border-ink"
                  } transition disabled:opacity-50`}
                >
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                    <span className="font-mono text-xs text-muted">Due {inv.due.slice(5)}</span>
                  </div>
                  <div className="font-serif text-lg leading-snug">{buyer.name}</div>
                  <div className="text-sm text-[color:var(--ink)]/70 mb-3">{inv.description}</div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono text-base">£{inv.amount.toLocaleString()}</span>
                    <span className="font-mono text-xs text-signal">
                      {state.running && isSelected ? "ANALYSING…" : "REQUEST ADVANCE →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 hair-t pt-5">
            <p className="eyebrow mb-2">How this works</p>
            <p className="text-sm text-[color:var(--ink)]/70 leading-relaxed">
              Click an invoice to request a cash advance. The underwriting agent reads your ledger
              history with that buyer, pulls live signals from Specter, cross-references Companies
              House, and either approves, declines, or escalates to a human credit analyst.
            </p>
          </div>
        </aside>

        {/* RIGHT — workspace */}
        <section className="col-span-12 lg:col-span-8 rise rise-2">
          {!selectedInvoice && (
            <EmptyState />
          )}

          {selectedInvoice && selectedBuyer && (
            <div className="space-y-8">
              {/* Header strip */}
              <div className="rule-b pb-5">
                <p className="eyebrow mb-2">Underwriting · {selectedInvoice.invoiceNumber}</p>
                <h1 className="font-serif text-4xl leading-tight">
                  {selectedBuyer.name}
                </h1>
                <p className="text-[color:var(--ink)]/70 mt-1">
                  {selectedBuyer.industry} · CH#{selectedBuyer.companiesHouseNumber}
                </p>
              </div>

              {/* Data sources panel */}
              {state.context && <DataSourcesPanel context={state.context} />}

              {/* Reasoning stream */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="eyebrow">Agent reasoning · live</p>
                  {state.running && <p className="font-mono text-xs text-signal">STREAMING</p>}
                </div>
                <div
                  ref={reasoningRef}
                  className="border border-faint p-6 min-h-[240px] max-h-[420px] overflow-y-auto bg-white/40"
                >
                  {displayedReasoning ? (
                    <div className={`font-serif text-[17px] leading-[1.65] whitespace-pre-wrap ${state.running ? "cursor-blink" : ""}`}>
                      {displayedReasoning}
                    </div>
                  ) : (
                    <div className="text-muted font-mono text-sm">
                      {state.running ? "Connecting to data sources…" : "Awaiting analysis."}
                    </div>
                  )}
                </div>
              </div>

              {/* Decision card */}
              {state.decision && <DecisionCard caseData={state.decision.case} />}

              {state.error && (
                <div className="border border-decline p-4 text-decline font-mono text-sm">
                  ERROR: {state.error}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <Footer />
    </main>
  );
}

function EmptyState() {
  return (
    <div className="hair-t hair-b py-16 text-center">
      <p className="eyebrow mb-4">Awaiting selection</p>
      <p className="font-serif text-2xl text-[color:var(--ink)]/60 max-w-md mx-auto leading-snug">
        Select an outstanding invoice on the left to request an advance.
      </p>
    </div>
  );
}

function DataSourcesPanel({ context }: { context: any }) {
  const ls = context.ledger;
  const sp = context.specter;
  const ch = context.companiesHouse;
  const trendArrow = ls.trendDelta > 1 ? "↑" : ls.trendDelta < -1 ? "↓" : "→";

  return (
    <div className="grid grid-cols-3 gap-px bg-faint border border-faint">
      {/* LEDGER */}
      <div className="bg-paper p-5">
        <p className="eyebrow mb-4">01 · Ledger</p>
        <Stat label="Months trading" value={ls.relationshipMonths.toString()} />
        <Stat label="Avg days late" value={ls.avgDaysLate.toString()} />
        <Stat
          label="Last 4 vs prev 4"
          value={`${ls.lastAvg} ${trendArrow} ${ls.prevAvg}`}
          tone={ls.trendDelta > 5 ? "warn" : ls.trendDelta < -2 ? "good" : "neutral"}
        />
        <Stat label="Total revenue" value={`£${(ls.totalRevenue / 1000).toFixed(0)}k`} />
      </div>

      {/* SPECTER */}
      <div className="bg-paper p-5">
        <div className="flex items-baseline justify-between mb-4">
          <p className="eyebrow">02 · Specter</p>
          <span className="font-mono text-[10px] text-muted uppercase">{sp.source}</span>
        </div>
        <Stat label="Health score" value={`${sp.signals.health_score}/100`} tone={scoreTone(sp.signals.health_score)} />
        <Stat
          label="Headcount Δ 90d"
          value={`${sp.signals.headcount_growth_90d_pct > 0 ? "+" : ""}${sp.signals.headcount_growth_90d_pct.toFixed(1)}%`}
          tone={sp.signals.headcount_growth_90d_pct < -5 ? "warn" : sp.signals.headcount_growth_90d_pct > 0 ? "good" : "neutral"}
        />
        <Stat
          label="Web traffic Δ 90d"
          value={`${sp.signals.web_traffic_growth_90d_pct > 0 ? "+" : ""}${sp.signals.web_traffic_growth_90d_pct.toFixed(1)}%`}
          tone={sp.signals.web_traffic_growth_90d_pct < -10 ? "warn" : "neutral"}
        />
        <Stat
          label="News sentiment 30d"
          value={sp.signals.news_sentiment_30d.toFixed(2)}
          tone={sp.signals.news_sentiment_30d < -0.1 ? "warn" : sp.signals.news_sentiment_30d > 0.2 ? "good" : "neutral"}
        />
        {sp.signals.notable_events_90d.length > 0 && (
          <div className="mt-3 pt-3 hair-t">
            <p className="eyebrow mb-2 text-[9px]">Notable events</p>
            <ul className="text-xs space-y-1 text-[color:var(--ink)]/80">
              {sp.signals.notable_events_90d.slice(0, 3).map((e: string, i: number) => (
                <li key={i} className="leading-snug">— {e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* COMPANIES HOUSE */}
      <div className="bg-paper p-5">
        <p className="eyebrow mb-4">03 · Companies House</p>
        <Stat
          label="Filings on time"
          value={ch.filingsOnTime ? "Yes" : "No"}
          tone={ch.filingsOnTime ? "good" : "warn"}
        />
        <Stat label="Last accounts" value={ch.lastAccountsFiled} />
        <Stat label="CCJs" value={ch.ccjs.toString()} tone={ch.ccjs > 0 ? "warn" : "neutral"} />
        <Stat
          label="Net assets"
          value={`£${(ch.netAssets / 1_000_000).toFixed(2)}m`}
          tone={ch.netAssets < 0 ? "warn" : "neutral"}
        />
      </div>
    </div>
  );
}

function scoreTone(s: number): "good" | "warn" | "neutral" {
  if (s >= 70) return "good";
  if (s < 40) return "warn";
  return "neutral";
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  const colour =
    tone === "good" ? "var(--approve)" : tone === "warn" ? "var(--decline)" : "var(--ink)";
  return (
    <div className="flex justify-between items-baseline py-1.5 hair-b last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-sm" style={{ color: colour }}>
        {value}
      </span>
    </div>
  );
}

function DecisionCard({ caseData }: { caseData: any }) {
  const d: Decision = caseData.decision;
  const verdictColour =
    d.verdict === "APPROVE"
      ? "var(--approve)"
      : d.verdict === "DECLINE"
      ? "var(--decline)"
      : "var(--escalate)";

  return (
    <div className="border-2 p-7 rise rise-3" style={{ borderColor: verdictColour }}>
      <div className="flex items-baseline justify-between mb-6">
        <p className="eyebrow" style={{ color: verdictColour }}>
          Decision · {new Date(caseData.createdAt).toLocaleTimeString("en-GB")}
        </p>
        <span className="font-mono text-xs text-muted">{caseData.id}</span>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        <div className="col-span-12 md:col-span-5">
          <h2 className="font-serif text-5xl tracking-tight" style={{ color: verdictColour }}>
            {d.verdict}
          </h2>
          <div className="mt-5">
            <div className="flex justify-between items-baseline mb-2">
              <span className="eyebrow">Confidence</span>
              <span className="font-mono text-sm">{d.confidence}%</span>
            </div>
            <div className="confidence-bar">
              <span style={{ width: `${d.confidence}%`, background: verdictColour }} />
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-7">
          {d.verdict !== "ESCALATE" ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="eyebrow mb-1">Advance</p>
                <p className="font-serif text-3xl">{d.advance_pct}%</p>
                <p className="font-mono text-sm text-muted">
                  £{((caseData.amount * d.advance_pct) / 100).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="eyebrow mb-1">Fee</p>
                <p className="font-serif text-3xl">{d.fee_bps} bps</p>
                <p className="font-mono text-sm text-muted">
                  £{((caseData.amount * d.fee_bps) / 10000).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="border-l-2 pl-5 py-1" style={{ borderColor: verdictColour }}>
              <p className="eyebrow mb-2" style={{ color: verdictColour }}>Why escalated</p>
              <p className="font-serif text-lg leading-snug">{d.escalation_reason}</p>
              <Link
                href="/analyst"
                className="inline-block mt-4 font-mono text-sm border border-ink px-3 py-2 hover:bg-ink hover:text-paper transition"
              >
                Open analyst desk →
              </Link>
            </div>
          )}
        </div>
      </div>

      {d.key_factors.length > 0 && (
        <div className="mt-6 pt-5 hair-t">
          <p className="eyebrow mb-3">Key factors</p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {d.key_factors.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
