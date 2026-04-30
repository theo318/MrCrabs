// The underwriting agent prompt. This is the heart of the product:
// the agent synthesises three data sources and produces a calibrated decision
// with explicit confidence and an honest escalation criterion.

export const SYSTEM_PROMPT = `You are FlowFi's underwriting agent. Your job is to decide whether to advance funds against a single supplier invoice.

You analyse three data sources for the BUYER (the company who will pay the invoice):

1. LEDGER HISTORY — the supplier's full payment history with this buyer. This is the most reliable signal: it shows how this specific buyer has actually paid this specific supplier over time. Look at trend, not just averages.

2. SPECTER SIGNALS — leading indicators of company health from public, real-time sources: hiring momentum, web traffic, news mentions, funding events, executive changes. These often move before credit bureau data.

3. COMPANIES HOUSE — UK statutory filings. Filing punctuality, CCJs, net assets, last accounts filed. Hard floor: missed filings or CCJs are red flags.

Your decision is one of:
- APPROVE — advance funds. Confidence ≥ 85%.
- DECLINE — do not advance. Confidence ≥ 85% the buyer will not pay or will pay too late.
- ESCALATE — borderline case. Pass to a human credit analyst with your reasoning.

CRITICAL RULES:
- Be honest about confidence. Do not round up to APPROVE just to close the case.
- Escalation is not a failure — it is the correct action when signals disagree.
- When the ledger says "fine" but Specter says "wobbly," ESCALATE. Humans handle conflict.
- Reasoning must reference specific numbers and observations, not vague language.
- Ledger trend is more important than ledger average. A buyer slipping from 5 to 30 days late over 12 months is more concerning than a buyer who has been steadily 20 days late forever.

Output FORMAT — your response must use these exact markdown headers in this order, then end with the decision block:

## Ledger
<2-4 sentences on the ledger history. Reference specific numbers.>

## Companies House
<2-4 sentences on the statutory filings. Reference specific numbers.>

## Specter
<2-4 sentences on the live company-health signals. Reference specific numbers.>

## Synthesis
<1-3 sentences synthesising the three sources, especially any conflict.>

<<<DECISION
verdict: APPROVE | DECLINE | ESCALATE
confidence: <integer 0-100>
advance_pct: <integer 0-100>  // % of invoice face value to advance
fee_bps: <integer>            // fee in basis points of face value
key_factors: <semicolon-separated short phrases, max 4>
escalation_reason: <one sentence if ESCALATE, otherwise empty>
DECISION>>>

Keep each section tight — this is read by humans in seconds, not minutes.`;

export type Decision = {
  verdict: "APPROVE" | "DECLINE" | "ESCALATE";
  confidence: number;
  advance_pct: number;
  fee_bps: number;
  key_factors: string[];
  escalation_reason: string;
};

export function parseDecision(text: string): Decision | null {
  const m = text.match(/<<<DECISION([\s\S]*?)DECISION>>>/);
  if (!m) return null;
  const block = m[1];
  const get = (key: string) => {
    const re = new RegExp(`${key}:\\s*(.+)`, "i");
    const mm = block.match(re);
    return mm ? mm[1].trim() : "";
  };
  const verdictRaw = get("verdict").toUpperCase();
  const verdict = (["APPROVE", "DECLINE", "ESCALATE"].includes(verdictRaw) ? verdictRaw : "ESCALATE") as Decision["verdict"];
  return {
    verdict,
    confidence: parseInt(get("confidence")) || 0,
    advance_pct: parseInt(get("advance_pct")) || 0,
    fee_bps: parseInt(get("fee_bps")) || 0,
    key_factors: get("key_factors")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean),
    escalation_reason: get("escalation_reason"),
  };
}

export function buildUserMessage(args: {
  invoice: { number: string; amount: number; issued: string; due: string; description: string };
  buyer: { name: string; ch: string; industry: string };
  ledger: ReturnType<typeof import("./mock-data").ledgerSummary>;
  ledgerLines: { invoiceNumber: string; amount: number; daysLate?: number; status: string }[];
  companiesHouse: { filingsOnTime: boolean; lastAccountsFiled: string; ccjs: number; netAssets: number };
  specter: any;
}) {
  return `# UNDERWRITING REQUEST

## Invoice
Number: ${args.invoice.number}
Amount: £${args.invoice.amount.toLocaleString()}
Issued: ${args.invoice.issued}
Due: ${args.invoice.due}
Description: ${args.invoice.description}

## Buyer
Name: ${args.buyer.name}
Companies House #: ${args.buyer.ch}
Industry: ${args.buyer.industry}

## Ledger history with this supplier (12 months)
Total invoices: ${args.ledger.totalInvoices}
Paid: ${args.ledger.paidCount} | Overdue: ${args.ledger.overdueCount}
Avg days late (all-time): ${args.ledger.avgDaysLate}
Avg days late — last 4 invoices: ${args.ledger.lastAvg}
Avg days late — previous 4 invoices: ${args.ledger.prevAvg}
Trend delta: ${args.ledger.trendDelta > 0 ? "+" : ""}${args.ledger.trendDelta} days (positive = worsening)
Total revenue with this buyer: £${args.ledger.totalRevenue.toLocaleString()}

Recent ledger lines (chronological):
${args.ledgerLines
  .map(
    (l) =>
      `  ${l.invoiceNumber} | £${l.amount.toLocaleString()} | ${l.status}${
        l.daysLate ? ` (${l.daysLate}d late)` : ""
      }`
  )
  .join("\n")}

## Companies House
Filings on time: ${args.companiesHouse.filingsOnTime ? "YES" : "NO"}
Last accounts filed: ${args.companiesHouse.lastAccountsFiled}
CCJs: ${args.companiesHouse.ccjs}
Net assets: £${args.companiesHouse.netAssets.toLocaleString()}

## Specter signals (live)
${JSON.stringify(args.specter, null, 2)}

Now analyse and decide. Walk through each data source, then synthesise.`;
}
