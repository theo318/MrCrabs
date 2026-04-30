"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SUPPLIER, getBuyer } from "@/lib/mock-data";
import type { Decision } from "@/lib/underwrite-prompt";
import { Topbar, Footer } from "@/components/Chrome";

type FetchStatus = "idle" | "fetching" | "fetched";
type SourceKey = "ledger" | "companiesHouse" | "specter";

type StreamState = {
  running: boolean;
  reasoning: string;
  context: any | null;
  decision: { case: any } | null;
  error: string | null;
  fetchStatus: Record<SourceKey, FetchStatus>;
};

const initialState: StreamState = {
  running: false,
  reasoning: "",
  context: null,
  decision: null,
  error: null,
  fetchStatus: { ledger: "idle", companiesHouse: "idle", specter: "idle" },
};

const TOOL_TO_SOURCE: Record<string, SourceKey> = {
  getLedgerHistory: "ledger",
  getCompaniesHouse: "companiesHouse",
  getSpecterSignals: "specter",
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
        } else if (eventName === "tool_call") {
          const src = TOOL_TO_SOURCE[data.tool];
          if (src) {
            setState((s) => ({ ...s, fetchStatus: { ...s.fetchStatus, [src]: "fetching" } }));
          }
        } else if (eventName === "tool_result") {
          const src = TOOL_TO_SOURCE[data.tool];
          if (src) {
            setState((s) => ({ ...s, fetchStatus: { ...s.fetchStatus, [src]: "fetched" } }));
          }
        } else if (eventName === "decision") {
          setState((s) => ({ ...s, decision: data }));
        } else if (eventName === "error") {
          setState((s) => ({ ...s, error: data.message, running: false }));
        } else if (eventName === "done") {
          // On stream end, mark any sources still idle as fetched so stats reveal
          // (covers the Anthropic fallback path where no tool events fire).
          setState((s) => ({
            ...s,
            running: false,
            fetchStatus: {
              ledger: s.fetchStatus.ledger === "idle" ? "fetched" : s.fetchStatus.ledger,
              companiesHouse: s.fetchStatus.companiesHouse === "idle" ? "fetched" : s.fetchStatus.companiesHouse,
              specter: s.fetchStatus.specter === "idle" ? "fetched" : s.fetchStatus.specter,
            },
          }));
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

        </aside>

        {/* RIGHT — workspace */}
        <section className="col-span-12 lg:col-span-8 rise rise-2">
          {!selectedInvoice && (
            <EmptyState />
          )}

          {selectedInvoice && selectedBuyer && (
            <div className="space-y-6">
              {/* Header strip */}
              <div className="rule-b pb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2">Underwriting</p>
                  <h1 className="font-serif text-4xl leading-tight">{selectedBuyer.name}</h1>
                  <p className="text-[color:var(--ink)]/70 mt-1">
                    Invoice number: {selectedInvoice.invoiceNumber}
                  </p>
                </div>
                {state.running && (
                  <p className="font-mono text-xs text-signal cursor-blink">STREAMING</p>
                )}
              </div>

              {/* Three source cards — vertically stacked, big, color-coded by status */}
              {state.context && (
                <div ref={reasoningRef} className="space-y-5">
                  {(() => {
                    const sections = splitReasoningBySource(state.reasoning);
                    const ctx = state.context;
                    const ledgerStat = ledgerStatus(ctx.ledger);
                    const chStat = chStatus(ctx.companiesHouse);
                    const spStat = specterStatus(ctx.specter.signals);
                    return (
                      <>
                        <SourceCard
                          title="Ledger"
                          fetchLabel="Reading ledger history"
                          fetchStatus={state.fetchStatus.ledger}
                          statLine={ledgerStatLine(ctx.ledger)}
                          status={ledgerStat}
                          whyLine={ledgerWhy(ctx.ledger, ledgerStat)}
                          reasoning={sections.ledger}
                          running={state.running}
                        />
                        <SourceCard
                          title="Companies House"
                          fetchLabel="Querying Companies House"
                          fetchStatus={state.fetchStatus.companiesHouse}
                          statLine={chStatLine(ctx.companiesHouse)}
                          status={chStat}
                          whyLine={chWhy(ctx.companiesHouse, chStat)}
                          reasoning={sections.companiesHouse}
                          running={state.running}
                        />
                        <SourceCard
                          title="Specter"
                          fetchLabel="Querying Specter live"
                          fetchStatus={state.fetchStatus.specter}
                          statLine={specterStatLine(ctx.specter)}
                          status={spStat}
                          whyLine={specterWhy(ctx.specter.signals, spStat)}
                          reasoning={sections.specter}
                          running={state.running}
                        />
                      </>
                    );
                  })()}
                </div>
              )}

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

type Status = "pass" | "warn" | "fail";

const STATUS_PALETTE: Record<Status, { color: string; label: string }> = {
  pass: { color: "var(--approve)", label: "CLEAN" },
  warn: { color: "var(--signal)", label: "CONCERN" },
  fail: { color: "var(--decline)", label: "FAIL" },
};

function SourceCard({
  title,
  fetchLabel,
  fetchStatus,
  statLine,
  status,
  whyLine,
  reasoning,
  running,
}: {
  title: string;
  fetchLabel: string;
  fetchStatus: FetchStatus;
  statLine: string;
  status: Status;
  whyLine: string | null;
  reasoning: string;
  running: boolean;
}) {
  // Until the agent has fetched THIS source, hide the verdict colour and stats
  // so the analysis feels live. Once fetched (or once the run is complete), the
  // card transitions to its full coloured state.
  const dataRevealed = fetchStatus === "fetched" || !running;
  const palette = dataRevealed ? STATUS_PALETTE[status] : STATUS_PALETTE.pass;
  const borderColour = dataRevealed ? palette.color : "var(--faint)";

  return (
    <div
      className="border-2 p-7 bg-white/40 rise transition-[border-color] duration-300"
      style={{ borderColor: borderColour }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h2
            className="font-serif text-5xl tracking-tight leading-none transition-colors duration-300"
            style={{ color: dataRevealed ? palette.color : "var(--ink)" }}
          >
            {title}
          </h2>
          {dataRevealed && whyLine && (
            <p
              className="font-mono text-sm mt-3 uppercase tracking-wide"
              style={{ color: palette.color }}
            >
              {whyLine}
            </p>
          )}
        </div>
        <FetchBadge
          status={fetchStatus}
          fetchLabel={fetchLabel}
          verdictColour={palette.color}
          verdictLabel={palette.label}
          dataRevealed={dataRevealed}
        />
      </div>

      <p className="font-mono text-sm text-[color:var(--ink)]/75 mb-5 min-h-[20px]">
        {dataRevealed ? statLine : <span className="text-muted">— awaiting data —</span>}
      </p>

      <div className="font-serif text-[17px] leading-[1.6] whitespace-pre-wrap min-h-[64px]">
        {reasoning ? (
          reasoning
        ) : (
          <span className="text-muted italic font-sans text-sm">
            {running ? "Awaiting analysis…" : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

function FetchBadge({
  status,
  fetchLabel,
  verdictColour,
  verdictLabel,
  dataRevealed,
}: {
  status: FetchStatus;
  fetchLabel: string;
  verdictColour: string;
  verdictLabel: string;
  dataRevealed: boolean;
}) {
  if (dataRevealed) {
    return (
      <span
        className="pill shrink-0"
        style={{ color: verdictColour, borderColor: verdictColour }}
      >
        {verdictLabel}
      </span>
    );
  }
  if (status === "fetching") {
    return (
      <span
        className="pill shrink-0 inline-flex items-center gap-2"
        style={{ color: "var(--signal)", borderColor: "var(--signal)" }}
      >
        <span className="fetch-dot" />
        {fetchLabel}…
      </span>
    );
  }
  return (
    <span
      className="pill shrink-0 inline-flex items-center gap-2"
      style={{ color: "var(--muted)", borderColor: "var(--faint)" }}
    >
      <span className="fetch-dot fetch-dot-idle" />
      Awaiting query
    </span>
  );
}

// Split the agent's streaming reasoning into per-source sections by `## ` markdown
// headers. Tolerates partial last section (still streaming) and varied phrasing
// like "## Ledger History Analysis" — matches on substring.
function splitReasoningBySource(text: string): {
  ledger: string;
  companiesHouse: string;
  specter: string;
} {
  const sections = { ledger: "", companiesHouse: "", specter: "" };
  if (!text) return sections;
  const re = /^##\s+(.+?)$([\s\S]*?)(?=^##\s|$)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const header = m[1].toLowerCase();
    const body = m[2].trim();
    if (/ledger/.test(header)) {
      sections.ledger = sections.ledger ? `${sections.ledger}\n\n${body}` : body;
    } else if (/companies\s*house/.test(header)) {
      sections.companiesHouse = sections.companiesHouse
        ? `${sections.companiesHouse}\n\n${body}`
        : body;
    } else if (/specter/.test(header)) {
      sections.specter = sections.specter ? `${sections.specter}\n\n${body}` : body;
    }
  }
  return sections;
}

// ---- Status helpers (deterministic, derived from the data context) ----

function ledgerStatus(l: any): Status {
  if (l.overdueCount >= 2 || l.trendDelta >= 25) return "fail";
  if (l.overdueCount >= 1 || l.trendDelta >= 8) return "warn";
  return "pass";
}

function chStatus(ch: any): Status {
  if (ch.ccjs > 0 || ch.netAssets < 0 || !ch.filingsOnTime) return "fail";
  return "pass";
}

function specterStatus(s: any): Status {
  if (s.health_score < 40 || s.headcount_growth_90d_pct <= -20) return "fail";
  if (s.health_score < 65 || s.headcount_growth_90d_pct < -5 || s.web_traffic_growth_90d_pct < -15)
    return "warn";
  return "pass";
}

function fmtSigned(n: number, suffix = "") {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}${suffix}`;
}

function ledgerStatLine(l: any) {
  return `${l.paidCount}/${l.totalInvoices} paid · ${l.overdueCount} overdue · trend ${fmtSigned(l.trendDelta, "d")} · revenue £${(l.totalRevenue / 1000).toFixed(0)}k`;
}

function chStatLine(ch: any) {
  return `Filings ${ch.filingsOnTime ? "on time" : "LATE"} · ${ch.ccjs} CCJ${ch.ccjs === 1 ? "" : "s"} · £${(ch.netAssets / 1_000_000).toFixed(2)}m net assets · last accounts ${ch.lastAccountsFiled}`;
}

function specterStatLine(sp: any) {
  const s = sp.signals;
  return `Health ${s.health_score}/100 · headcount ${fmtSigned(s.headcount_growth_90d_pct, "%")} · traffic ${fmtSigned(s.web_traffic_growth_90d_pct, "%")} · sentiment ${s.news_sentiment_30d.toFixed(2)} · ${sp.source}`;
}

function ledgerWhy(l: any, status: Status) {
  if (status === "pass") return null;
  const bits: string[] = [];
  if (l.overdueCount >= 1) bits.push(`${l.overdueCount} invoice${l.overdueCount === 1 ? "" : "s"} overdue`);
  if (l.trendDelta >= 8) bits.push(`payment lag accelerating ${fmtSigned(l.trendDelta, "d")}`);
  return bits.length ? bits.join(" · ") : null;
}

function chWhy(ch: any, status: Status) {
  if (status === "pass") return null;
  const bits: string[] = [];
  if (ch.ccjs > 0) bits.push(`${ch.ccjs} CCJ${ch.ccjs === 1 ? "" : "s"}`);
  if (ch.netAssets < 0) bits.push("negative net assets");
  if (!ch.filingsOnTime) bits.push("filings overdue");
  return bits.length ? bits.join(" · ") : null;
}

function specterWhy(s: any, status: Status) {
  if (status === "pass") return null;
  const bits: string[] = [];
  if (s.health_score < 40) bits.push(`health critical ${s.health_score}/100`);
  else if (s.health_score < 65) bits.push(`health weakening ${s.health_score}/100`);
  if (s.headcount_growth_90d_pct < -5) bits.push(`headcount ${fmtSigned(s.headcount_growth_90d_pct, "%")}`);
  if (s.web_traffic_growth_90d_pct < -15) bits.push(`traffic ${fmtSigned(s.web_traffic_growth_90d_pct, "%")}`);
  return bits.length ? bits.join(" · ") : null;
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
