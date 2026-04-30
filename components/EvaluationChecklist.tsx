"use client";

import { useState, type ReactNode } from "react";
import type { CriterionScore, Evaluation } from "@/lib/underwrite-prompt";
import { CRITERION_ORDER } from "@/lib/underwrite-prompt";

const STATUS_STYLE: Record<CriterionScore, { icon: string; color: string; label: string }> = {
  PASS: { icon: "✓", color: "var(--approve)", label: "PASS" },
  CONCERN: { icon: "⚠", color: "var(--signal)", label: "CONCERN" },
  FAIL: { icon: "✗", color: "var(--decline)", label: "FAIL" },
  "N/A": { icon: "—", color: "var(--muted)", label: "N/A" },
};

type CriterionMeta = {
  number: string;
  label: string;
  definition: string;
  threshold: string;
  renderData: (ctx: ChecklistContext) => ReactNode;
};

export type ChecklistContext = {
  ledger?: {
    relationshipMonths: number;
    totalInvoices: number;
    paidCount: number;
    overdueCount: number;
    avgDaysLate: number;
    lastAvg: number;
    prevAvg: number;
    trendDelta: number;
    totalRevenue: number;
  };
  companiesHouse?: {
    filingsOnTime: boolean;
    lastAccountsFiled: string;
    ccjs: number;
    netAssets: number;
  };
  specter?: {
    source?: string;
    signals?: {
      health_score: number;
      headcount: number;
      headcount_growth_90d_pct: number;
      web_traffic_rank?: number;
      web_traffic_growth_90d_pct: number;
      news_sentiment_30d: number;
      executive_changes_90d: number;
      glassdoor_rating?: number;
      funding_total_usd?: number;
      last_funding_round?: { stage: string; amount_usd: number; date: string } | null;
      notable_events_90d: string[];
    };
  };
};

function fmtSigned(n: number, suffix = "") {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}${suffix}`;
}

function DataKv({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted font-mono text-xs uppercase tracking-wide">{k}</dt>
          <dd className="font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function EventList({ events, source }: { events: string[]; source?: string }) {
  if (!events?.length) {
    return <p className="text-sm text-muted italic">No notable events in the last 90 days.</p>;
  }
  return (
    <div>
      <ul className="space-y-1.5 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span className="text-muted font-mono">·</span>
            <span>{e}</span>
          </li>
        ))}
      </ul>
      {source && (
        <p className="mt-3 text-[11px] uppercase tracking-wide text-muted font-mono">
          source: {source}
        </p>
      )}
    </div>
  );
}

const CRITERIA_META: Record<keyof Evaluation, CriterionMeta> = {
  payment_history: {
    number: "01",
    label: "Payment history depth",
    definition: "Months of continuous billing relationship between supplier and buyer.",
    threshold: "PASS ≥ 6 · CONCERN 3-5 · FAIL < 3",
    renderData: (ctx) =>
      ctx.ledger ? (
        <DataKv
          items={[
            ["Months trading", String(ctx.ledger.relationshipMonths)],
            ["Invoices on file", String(ctx.ledger.totalInvoices)],
            ["Paid / overdue", `${ctx.ledger.paidCount} / ${ctx.ledger.overdueCount}`],
            ["Total revenue", `£${ctx.ledger.totalRevenue.toLocaleString()}`],
          ]}
        />
      ) : null,
  },
  payment_behaviour: {
    number: "02",
    label: "Payment behaviour",
    definition: "Average days late on paid invoices — how punctually this buyer pays this supplier.",
    threshold: "PASS < 15 · CONCERN 15-30 · FAIL > 30",
    renderData: (ctx) =>
      ctx.ledger ? (
        <DataKv
          items={[
            ["Avg days late (all-time)", `${ctx.ledger.avgDaysLate}d`],
            ["Avg last 4 invoices", `${ctx.ledger.lastAvg}d`],
            ["Avg prev 4 invoices", `${ctx.ledger.prevAvg}d`],
          ]}
        />
      ) : null,
  },
  payment_trend: {
    number: "03",
    label: "Payment trend",
    definition:
      "Direction of payment behaviour: avg days-late on the last 4 invoices vs. the previous 4. Positive = worsening, negative = improving.",
    threshold: "PASS ≤ 0 · CONCERN 1-10 · FAIL > 10",
    renderData: (ctx) =>
      ctx.ledger ? (
        <DataKv
          items={[
            ["Last 4 avg", `${ctx.ledger.lastAvg}d`],
            ["Prev 4 avg", `${ctx.ledger.prevAvg}d`],
            ["Trend delta", fmtSigned(ctx.ledger.trendDelta, "d")],
          ]}
        />
      ) : null,
  },
  ccj_check: {
    number: "04",
    label: "CCJ check",
    definition: "County court judgments registered against the buyer at Companies House.",
    threshold: "PASS 0 · FAIL any",
    renderData: (ctx) =>
      ctx.companiesHouse ? (
        <DataKv items={[["Active CCJs", String(ctx.companiesHouse.ccjs)]]} />
      ) : null,
  },
  financial_standing: {
    number: "05",
    label: "Financial standing",
    definition: "Net assets (equity) from the most recently filed statutory accounts.",
    threshold: "PASS > £1m · CONCERN £0-£1m · FAIL negative",
    renderData: (ctx) =>
      ctx.companiesHouse ? (
        <DataKv
          items={[
            ["Net assets", `£${ctx.companiesHouse.netAssets.toLocaleString()}`],
            ["Last accounts", ctx.companiesHouse.lastAccountsFiled],
          ]}
        />
      ) : null,
  },
  filing_punctuality: {
    number: "06",
    label: "Filing punctuality",
    definition: "Whether the buyer files Companies House returns on time. Late filings often precede distress.",
    threshold: "PASS yes · FAIL no",
    renderData: (ctx) =>
      ctx.companiesHouse ? (
        <DataKv
          items={[
            ["On-time filings", ctx.companiesHouse.filingsOnTime ? "Yes" : "No"],
            ["Last accounts", ctx.companiesHouse.lastAccountsFiled],
          ]}
        />
      ) : null,
  },
  forward_health: {
    number: "07",
    label: "Forward health",
    definition:
      "Specter composite health index (0-100). Blends hiring momentum, web traffic, news sentiment, funding, exec stability and reputation. Forward-looking — captures distress weeks before statutory data does.",
    threshold: "PASS ≥ 70 · CONCERN 40-69 · FAIL < 40",
    renderData: (ctx) => {
      const s = ctx.specter?.signals;
      if (!s) return null;
      const fundingM = s.funding_total_usd ? `$${(s.funding_total_usd / 1_000_000).toFixed(1)}m` : "—";
      const lastRound = s.last_funding_round
        ? `${s.last_funding_round.stage} · $${(s.last_funding_round.amount_usd / 1_000_000).toFixed(1)}m · ${s.last_funding_round.date}`
        : "—";
      return (
        <DataKv
          items={[
            ["Health score", `${s.health_score} / 100`],
            ["Headcount growth", fmtSigned(s.headcount_growth_90d_pct, "%")],
            ["Web traffic 90d", fmtSigned(s.web_traffic_growth_90d_pct, "%")],
            ["News sentiment 30d", s.news_sentiment_30d.toFixed(2)],
            ["Funding total", fundingM],
            ["Last round", lastRound],
            ["Exec changes 90d", String(s.executive_changes_90d)],
            ["Glassdoor", s.glassdoor_rating?.toFixed(1) ?? "—"],
          ]}
        />
      );
    },
  },
  headcount_momentum: {
    number: "08",
    label: "Headcount momentum",
    definition: "90-day change in employee count from Specter. Sustained shrinkage is an early distress signal.",
    threshold: "PASS ≥ 0% · CONCERN -1% to -10% · FAIL < -10%",
    renderData: (ctx) => {
      const s = ctx.specter?.signals;
      if (!s) return null;
      return (
        <DataKv
          items={[
            ["Headcount", String(s.headcount)],
            ["Δ 90 days", fmtSigned(s.headcount_growth_90d_pct, "%")],
          ]}
        />
      );
    },
  },
  adverse_news: {
    number: "09",
    label: "Adverse news",
    definition:
      "Notable events surfaced by Specter from public press, regulatory filings and management announcements over the last 90 days.",
    threshold: "PASS 0 · CONCERN 1-2 · FAIL 3+",
    renderData: (ctx) => (
      <EventList
        events={ctx.specter?.signals?.notable_events_90d ?? []}
        source={ctx.specter?.source}
      />
    ),
  },
};

function ChecklistRow({
  meta,
  result,
  context,
  expanded,
  onToggle,
}: {
  meta: CriterionMeta;
  result: { score: CriterionScore; note: string };
  context: ChecklistContext;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLE[result.score];
  return (
    <div className="hair-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left grid grid-cols-[28px_28px_1fr_auto_88px] items-center gap-3 py-3 px-4 hover:bg-soft transition"
      >
        <span
          className="text-lg leading-none font-mono"
          style={{ color: style.color }}
          aria-hidden
        >
          {style.icon}
        </span>
        <span className="font-mono text-xs text-muted">{meta.number}</span>
        <span className="font-serif text-base leading-snug">{meta.label}</span>
        <span className="font-mono text-sm text-[color:var(--ink)]/75 hidden sm:block truncate max-w-[280px]">
          {result.note}
        </span>
        <span
          className="pill text-center justify-self-end"
          style={{ color: style.color, borderColor: style.color }}
        >
          {style.label}
        </span>
      </button>
      {expanded && (
        <div className="px-12 pb-5 -mt-1">
          <div className="border-l-2 pl-5 py-2 space-y-3" style={{ borderColor: style.color }}>
            <p className="text-sm leading-snug">{meta.definition}</p>
            <p className="text-xs font-mono text-muted uppercase tracking-wide">
              Thresholds — {meta.threshold}
            </p>
            <div className="pt-1">{meta.renderData(context)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EvaluationChecklist({
  evaluation,
  context,
  startExpanded = false,
}: {
  evaluation: Evaluation | null;
  context: ChecklistContext | null;
  /** Analyst-desk variant defaults to all rows expanded. */
  startExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => (startExpanded ? new Set(CRITERION_ORDER as string[]) : new Set())
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Derive header counts. If no evaluation yet, show all 9 as N/A.
  const items = CRITERION_ORDER.map((k) => ({
    key: k,
    meta: CRITERIA_META[k],
    result: evaluation?.[k] ?? { score: "N/A" as CriterionScore, note: "—" },
  }));
  const passCount = items.filter((i) => i.result.score === "PASS").length;
  const concernCount = items.filter((i) => i.result.score === "CONCERN").length;
  const failCount = items.filter((i) => i.result.score === "FAIL").length;
  const completedCount = items.filter((i) => i.result.score !== "N/A").length;

  const ctx: ChecklistContext = context ?? {};

  return (
    <div className="border border-faint bg-paper">
      {/* Aggregate header */}
      <div className="px-4 py-4 hair-b flex items-baseline justify-between gap-4 flex-wrap">
        <p className="font-serif text-2xl tracking-tight">Underwriting evaluation</p>
        <p className="font-mono text-xs text-muted">
          {completedCount} of 9 complete · {passCount} pass · {concernCount} concern · {failCount} fail
        </p>
      </div>

      {/* Debtor risk — the only layer surfaced in the demo */}
      <div>
        {items.map(({ key, meta, result }) => (
          <ChecklistRow
            key={key}
            meta={meta}
            result={result}
            context={ctx}
            expanded={expanded.has(key)}
            onToggle={() => toggle(key)}
          />
        ))}
      </div>
    </div>
  );
}
