"use client";

import { useEffect, useState } from "react";
import { Topbar, Footer } from "@/components/Chrome";
import type { Case } from "@/lib/store";

export default function AnalystPage() {
  const [allCases, setAllCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);

  async function load() {
    const r = await fetch("/api/cases", { cache: "no-store" });
    const j = await r.json();
    setAllCases(j.cases);
    if (!selectedId && j.cases.length) setSelectedId(j.cases[0].id);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, []);

  const escalations = allCases.filter((c) => c.decision.verdict === "ESCALATE" && !c.humanVerdict);
  const decided = allCases.filter((c) => c.humanVerdict || c.decision.verdict !== "ESCALATE");
  const selected = allCases.find((c) => c.id === selectedId);

  async function override(verdict: "APPROVE" | "DECLINE") {
    if (!selected) return;
    setOverrideLoading(true);
    await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, verdict, notes }),
    });
    setNotes("");
    await load();
    setOverrideLoading(false);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar active="analyst" />

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-8 py-10 grid grid-cols-12 gap-8">
        {/* Queue */}
        <aside className="col-span-12 lg:col-span-4 rise rise-1">
          <div className="hair-b pb-3 mb-5 flex items-baseline justify-between">
            <p className="eyebrow">Escalation queue</p>
            <p className="font-mono text-xs" style={{ color: "var(--escalate)" }}>
              {escalations.length} OPEN
            </p>
          </div>

          {escalations.length === 0 && (
            <div className="hair-t hair-b py-10 text-center">
              <p className="font-serif text-xl text-muted">No open cases</p>
              <p className="font-mono text-xs text-muted mt-2">
                Run an underwriting from the supplier console to populate.
              </p>
            </div>
          )}

          <div className="space-y-1 mb-8">
            {escalations.map((c) => (
              <CaseCard key={c.id} c={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            ))}
          </div>

          {decided.length > 0 && (
            <>
              <div className="hair-b pb-3 mb-3 mt-10">
                <p className="eyebrow">Decided · log</p>
              </div>
              <div className="space-y-1">
                {decided.map((c) => (
                  <CaseCard key={c.id} c={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} compact />
                ))}
              </div>
            </>
          )}
        </aside>

        {/* Detail */}
        <section className="col-span-12 lg:col-span-8 rise rise-2">
          {!selected ? (
            <div className="hair-t hair-b py-16 text-center">
              <p className="eyebrow mb-4">No case selected</p>
              <p className="font-serif text-2xl text-[color:var(--ink)]/60 max-w-md mx-auto leading-snug">
                Open a case from the queue, or run a fresh underwriting from the supplier console.
              </p>
            </div>
          ) : (
            <CaseDetail c={selected} notes={notes} setNotes={setNotes} override={override} loading={overrideLoading} />
          )}
        </section>
      </div>

      <Footer />
    </main>
  );
}

function CaseCard({ c, active, onClick, compact }: { c: Case; active: boolean; onClick: () => void; compact?: boolean }) {
  const verdict = c.humanVerdict ?? c.decision.verdict;
  const colour =
    verdict === "APPROVE" ? "var(--approve)" : verdict === "DECLINE" ? "var(--decline)" : "var(--escalate)";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border ${active ? "border-ink bg-soft" : "border-faint hover:border-ink"} transition`}
    >
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-xs">{c.invoiceNumber}</span>
        <span className="pill" style={{ color: colour }}>
          {verdict}
        </span>
      </div>
      <div className={`font-serif ${compact ? "text-base" : "text-lg"} leading-snug`}>{c.buyerName}</div>
      {!compact && (
        <div className="flex justify-between items-baseline mt-2">
          <span className="font-mono text-xs text-muted">£{c.amount.toLocaleString()}</span>
          <span className="font-mono text-xs text-muted">conf {c.decision.confidence}%</span>
        </div>
      )}
    </button>
  );
}

function CaseDetail({
  c,
  notes,
  setNotes,
  override,
  loading,
}: {
  c: Case;
  notes: string;
  setNotes: (s: string) => void;
  override: (v: "APPROVE" | "DECLINE") => void;
  loading: boolean;
}) {
  const isDecided = !!c.humanVerdict;
  const sp = c.specterSnapshot;
  const ls = c.ledgerSnapshot.summary;

  return (
    <div className="space-y-8">
      <div className="rule-b pb-5">
        <p className="eyebrow mb-2">{c.id} · {new Date(c.createdAt).toLocaleString("en-GB")}</p>
        <h1 className="font-serif text-4xl leading-tight">{c.buyerName}</h1>
        <p className="text-[color:var(--ink)]/70 mt-1">
          {c.invoiceNumber} · £{c.amount.toLocaleString()}
        </p>
      </div>

      {/* Why escalated */}
      <div className="border-l-4 pl-6 py-2" style={{ borderColor: "var(--escalate)" }}>
        <p className="eyebrow mb-2" style={{ color: "var(--escalate)" }}>
          Agent verdict · {c.decision.verdict} · confidence {c.decision.confidence}%
        </p>
        {c.decision.escalation_reason && (
          <p className="font-serif text-xl leading-snug">{c.decision.escalation_reason}</p>
        )}
        {c.decision.key_factors.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {c.decision.key_factors.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-3 gap-px bg-faint border border-faint">
        <div className="bg-paper p-5">
          <p className="eyebrow mb-3">01 · Ledger</p>
          <KV k="Months" v={ls.relationshipMonths.toString()} />
          <KV k="Avg late" v={`${ls.avgDaysLate}d`} />
          <KV k="Last 4 avg" v={`${ls.lastAvg}d`} tone={ls.lastAvg > 20 ? "warn" : "neutral"} />
          <KV k="Prev 4 avg" v={`${ls.prevAvg}d`} />
          <KV k="Trend" v={`${ls.trendDelta > 0 ? "+" : ""}${ls.trendDelta}d`} tone={ls.trendDelta > 5 ? "warn" : "neutral"} />
          <KV k="Revenue" v={`£${(ls.totalRevenue / 1000).toFixed(0)}k`} />
        </div>
        <div className="bg-paper p-5">
          <p className="eyebrow mb-3">02 · Specter</p>
          <KV k="Health" v={`${sp.signals.health_score}/100`} />
          <KV k="Headcount Δ" v={`${sp.signals.headcount_growth_90d_pct.toFixed(1)}%`} tone={sp.signals.headcount_growth_90d_pct < -5 ? "warn" : "neutral"} />
          <KV k="Web traffic Δ" v={`${sp.signals.web_traffic_growth_90d_pct.toFixed(1)}%`} tone={sp.signals.web_traffic_growth_90d_pct < -10 ? "warn" : "neutral"} />
          <KV k="Sentiment" v={sp.signals.news_sentiment_30d.toFixed(2)} tone={sp.signals.news_sentiment_30d < -0.1 ? "warn" : "neutral"} />
          {sp.signals.notable_events_90d?.length > 0 && (
            <div className="mt-3 pt-3 hair-t">
              <p className="eyebrow mb-2 text-[9px]">Events</p>
              <ul className="text-xs space-y-1 text-[color:var(--ink)]/80">
                {sp.signals.notable_events_90d.map((e: string, i: number) => (
                  <li key={i} className="leading-snug">— {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="bg-paper p-5">
          <p className="eyebrow mb-3">03 · Companies House</p>
          <KV k="On time" v={c.chSnapshot.filingsOnTime ? "Yes" : "No"} tone={c.chSnapshot.filingsOnTime ? "good" : "warn"} />
          <KV k="Last filed" v={c.chSnapshot.lastAccountsFiled} />
          <KV k="CCJs" v={c.chSnapshot.ccjs.toString()} tone={c.chSnapshot.ccjs > 0 ? "warn" : "neutral"} />
          <KV k="Net assets" v={`£${(c.chSnapshot.netAssets / 1_000_000).toFixed(2)}m`} tone={c.chSnapshot.netAssets < 0 ? "warn" : "neutral"} />
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <p className="eyebrow mb-3">Agent reasoning · transcript</p>
        <div className="border border-faint p-6 max-h-[320px] overflow-y-auto bg-white/40">
          <div className="font-serif text-[16px] leading-[1.65] whitespace-pre-wrap">
            {c.reasoning}
          </div>
        </div>
      </div>

      {/* Override */}
      {!isDecided && c.decision.verdict === "ESCALATE" && (
        <div className="rule-t pt-6">
          <p className="eyebrow mb-3">Human decision</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for the audit log…"
            className="w-full p-4 border border-faint bg-white/60 font-mono text-sm focus:border-ink focus:outline-none mb-4"
            rows={3}
          />
          <div className="flex gap-3">
            <button
              disabled={loading}
              onClick={() => override("APPROVE")}
              className="px-6 py-3 font-mono text-sm border-2 disabled:opacity-50 hover:bg-approve hover:text-paper transition"
              style={{ borderColor: "var(--approve)", color: "var(--approve)" }}
            >
              APPROVE & ADVANCE
            </button>
            <button
              disabled={loading}
              onClick={() => override("DECLINE")}
              className="px-6 py-3 font-mono text-sm border-2 disabled:opacity-50 hover:bg-decline hover:text-paper transition"
              style={{ borderColor: "var(--decline)", color: "var(--decline)" }}
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {isDecided && (
        <div className="rule-t pt-6">
          <p className="eyebrow mb-2">Resolved</p>
          <p className="font-serif text-xl">
            Human override:{" "}
            <span style={{ color: c.humanVerdict === "APPROVE" ? "var(--approve)" : "var(--decline)" }}>
              {c.humanVerdict}
            </span>
          </p>
          {c.humanNotes && <p className="text-[color:var(--ink)]/70 mt-2 font-mono text-sm">{c.humanNotes}</p>}
          <p className="font-mono text-xs text-muted mt-3">
            {c.humanDecidedAt && new Date(c.humanDecidedAt).toLocaleString("en-GB")}
          </p>
        </div>
      )}
    </div>
  );
}

function KV({ k, v, tone = "neutral" }: { k: string; v: string; tone?: "good" | "warn" | "neutral" }) {
  const colour = tone === "good" ? "var(--approve)" : tone === "warn" ? "var(--decline)" : "var(--ink)";
  return (
    <div className="flex justify-between items-baseline py-1.5 hair-b last:border-0">
      <span className="text-xs text-muted">{k}</span>
      <span className="font-mono text-sm" style={{ color: colour }}>
        {v}
      </span>
    </div>
  );
}
