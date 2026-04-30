// Fetch + cache + anonymise layer for the single real-data demo invoice.
// Spawns a fresh Xero MCP subprocess (npx -y @xeroapi/xero-mcp-server@latest),
// pulls the real client's contact + invoices, derives ledger summary stats,
// fetches Specter using the real domain, and produces a redacted payload that
// the agent-tools layer hands to the underwriting agent.
//
// Real client identity is held only in this module's in-memory cache and in
// the Xero MCP subprocess itself. Callers OUTSIDE this file MUST use
// loadRealDataAnonymised() — never loadRealData() — so client names cannot
// leak into the SSE stream, the case store, or the UI.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ledgerSummary, type LedgerLine } from "./mock-data";
import { fetchSpecter, type SpecterResponse } from "./specter";

// ---- Identity of the real client (server-side only) ----------------------
// The contact name we look up in Xero. Resolves to an automotive-marketplace
// SME with active monthly billing — full anonymisation rules below scrub
// any leak of the literal string before data leaves this module.
const REAL_CLIENT_NAME = "Motorway";
const REAL_CLIENT_DOMAIN = "motorway.co.uk";
// Companies House number for Motorway Online Ltd (publicly registered).
// Kept here for the hackathon demo so we don't need a separate CH API key.
const REAL_CH_NUMBER = "09347453";
const REAL_CH_FILINGS_ON_TIME = true;
const REAL_CH_LAST_ACCOUNTS = "2025-09-30";
const REAL_CH_CCJS = 0;
const REAL_CH_NET_ASSETS = 22_400_000;
// Display values — what reaches the UI. Never override per-call.
const ANON_BUYER_NAME = "Buyer · UK automotive marketplace";
const ANON_INDUSTRY = "Online vehicle marketplace";
const ANON_DOMAIN = "anonymised.example";
const ANON_CH_NUMBER = "0XXXXXXX";

export type RealLedger = {
  buyer: { id: string; name: string; industry: string };
  summary: ReturnType<typeof ledgerSummary>;
  recentLines: LedgerLine[];
};
export type RealCH = {
  buyer: { id: string; name: string };
  companiesHouseNumber: string;
  filingsOnTime: boolean;
  lastAccountsFiled: string;
  ccjs: number;
  netAssets: number;
};
export type RealSpecter = SpecterResponse;

type Bundle = {
  ledger: RealLedger;
  ch: RealCH;
  specter: RealSpecter;
  // Recommended invoice amount for the live invoice tile (rounded).
  recommendedAmount: number;
};

let cache: Bundle | null = null;
let inflight: Promise<Bundle> | null = null;

// -------------------------------------------------------------------------
// Xero MCP subprocess
// -------------------------------------------------------------------------

async function withXeroClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const id = process.env.XERO_CLIENT_ID;
  const secret = process.env.XERO_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("XERO_CLIENT_ID / XERO_CLIENT_SECRET not set");
  }
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@xeroapi/xero-mcp-server@latest"],
    env: {
      // Inherit PATH so npx can find node and its caches.
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      XERO_CLIENT_ID: id,
      XERO_CLIENT_SECRET: secret,
    },
    stderr: "pipe",
  });
  const client = new Client(
    { name: "mrcrabs-real-data", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

// MCP tool results come back as { content: [{ type: "text", text: "..." }, ...] }.
// The Xero MCP server returns human-formatted text rather than JSON, so we keep
// the raw text and parse the fields we need with regexes. This is more brittle
// than a JSON contract but matches what the server actually emits.
function callToolText(result: any): string {
  if (!result || !Array.isArray(result.content)) return "";
  return result.content
    .filter((c: any) => c?.type === "text" && typeof c.text === "string")
    .map((c: any) => c.text as string)
    .join("\n");
}

async function findContactId(client: Client, name: string): Promise<string> {
  const res = await client.callTool({
    name: "list-contacts",
    arguments: { searchTerm: name },
  });
  const text = callToolText(res);
  // Match "ID: <uuid>" on a contact whose Name line equals the target. We pick
  // the first ID emitted; the search term is exact enough that mis-matches are
  // unlikely (case-insensitive single-word handle).
  const idMatch = text.match(/ID:\s*([0-9a-f-]{36})/i);
  if (!idMatch) throw new Error(`Real client not found in Xero (searched: ${name})`);
  return idMatch[1];
}

type RawInvoice = {
  invoiceNumber: string;
  status: string; // PAID | AUTHORISED | DELETED | DRAFT | ...
  date: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  total: number;
  fullyPaidOn?: string; // ISO yyyy-mm-dd if PAID
  amountDue?: number; // present if AUTHORISED / partially paid
};

function parseDateToISO(s: string): string {
  // Xero MCP emits human strings like "Tue Mar 03 2026 00:00:00 GMT+0000 ..."
  // Date.parse handles those; truncate to YYYY-MM-DD.
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

function parseInvoiceBlocks(text: string): RawInvoice[] {
  const blocks = text.split(/Invoice ID:/).slice(1);
  const out: RawInvoice[] = [];
  for (const block of blocks) {
    const get = (label: string) => {
      const re = new RegExp(`${label}:\\s*(.+)`);
      const m = block.match(re);
      return m ? m[1].trim() : "";
    };
    const inv: RawInvoice = {
      invoiceNumber: get("Invoice"),
      status: get("Status"),
      date: parseDateToISO(get("Date")),
      dueDate: parseDateToISO(get("Due Date")),
      total: Number(get("Total")) || 0,
      fullyPaidOn: parseDateToISO(get("Fully Paid On")) || undefined,
      amountDue: Number(get("Amount Due")) || undefined,
    };
    out.push(inv);
  }
  return out;
}

async function fetchInvoices(client: Client, contactId: string): Promise<RawInvoice[]> {
  const all: RawInvoice[] = [];
  // Cap pagination so a buggy server can't run forever. 5 pages * 10 = 50 invoices,
  // plenty for 12 months of monthly billing.
  for (let page = 1; page <= 5; page++) {
    const res = await client.callTool({
      name: "list-invoices",
      arguments: { page, contactIds: [contactId] },
    });
    const text = callToolText(res);
    const batch = parseInvoiceBlocks(text);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 10) break; // last page
  }
  return all;
}

// -------------------------------------------------------------------------
// Mapping into our ledger schema
// -------------------------------------------------------------------------

function toLedgerLines(invoices: RawInvoice[], today = new Date()): LedgerLine[] {
  const out: LedgerLine[] = [];
  // Sort chronological so trend-delta math is meaningful.
  const sorted = [...invoices].sort((a, b) => a.date.localeCompare(b.date));
  for (const inv of sorted) {
    const status = inv.status.toUpperCase();
    if (status === "DELETED" || status === "VOIDED" || status === "DRAFT") continue;
    if (!inv.date || !inv.dueDate) continue;
    const due = new Date(inv.dueDate);
    if (status === "PAID" && inv.fullyPaidOn) {
      const paid = new Date(inv.fullyPaidOn);
      const daysLate = Math.max(0, Math.round((paid.getTime() - due.getTime()) / 86_400_000));
      out.push({
        invoiceNumber: inv.invoiceNumber,
        issued: inv.date,
        due: inv.dueDate,
        paid: inv.fullyPaidOn,
        amount: inv.total,
        status: "paid",
        daysLate,
      });
    } else if (status === "AUTHORISED" || status === "SUBMITTED") {
      const isOverdue = today.getTime() > due.getTime();
      const daysLate = isOverdue
        ? Math.round((today.getTime() - due.getTime()) / 86_400_000)
        : undefined;
      out.push({
        invoiceNumber: inv.invoiceNumber,
        issued: inv.date,
        due: inv.dueDate,
        paid: null,
        amount: inv.total,
        status: isOverdue ? "overdue" : "outstanding",
        daysLate,
      });
    }
  }
  return out;
}

// Round to nearest £500, matches the spec's "obscure the real amount" rule.
function roundForDisplay(n: number): number {
  return Math.round(n / 500) * 500;
}

// -------------------------------------------------------------------------
// Main loaders
// -------------------------------------------------------------------------

async function loadInner(): Promise<Bundle> {
  const ledgerLines = await withXeroClient(async (client) => {
    const contactId = await findContactId(client, REAL_CLIENT_NAME);
    const invoices = await fetchInvoices(client, contactId);
    if (invoices.length === 0) {
      throw new Error("Real client has no invoices in Xero");
    }
    const lines = toLedgerLines(invoices);
    if (lines.length < 6) {
      throw new Error(`Real client has only ${lines.length} valid invoices — need ≥6`);
    }
    return lines;
  });

  const buyerForSummary = {
    id: "buy-real-1",
    name: REAL_CLIENT_NAME,
    companiesHouseNumber: REAL_CH_NUMBER,
    domain: REAL_CLIENT_DOMAIN,
    industry: ANON_INDUSTRY,
    ledger: ledgerLines,
    filingsOnTime: REAL_CH_FILINGS_ON_TIME,
    lastAccountsFiled: REAL_CH_LAST_ACCOUNTS,
    ccjs: REAL_CH_CCJS,
    netAssets: REAL_CH_NET_ASSETS,
  };
  const summary = ledgerSummary(buyerForSummary);

  // Pick the most recent outstanding invoice's amount (rounded) for the tile.
  const lastOutstanding = [...ledgerLines]
    .reverse()
    .find((l) => l.status === "outstanding" || l.status === "overdue");
  const recommendedAmount = roundForDisplay(
    lastOutstanding?.amount ?? ledgerLines[ledgerLines.length - 1]!.amount
  );

  const ledger: RealLedger = {
    buyer: { id: "buy-real-1", name: REAL_CLIENT_NAME, industry: ANON_INDUSTRY },
    summary,
    recentLines: ledgerLines.slice(-8),
  };
  const ch: RealCH = {
    buyer: { id: "buy-real-1", name: REAL_CLIENT_NAME },
    companiesHouseNumber: REAL_CH_NUMBER,
    filingsOnTime: REAL_CH_FILINGS_ON_TIME,
    lastAccountsFiled: REAL_CH_LAST_ACCOUNTS,
    ccjs: REAL_CH_CCJS,
    netAssets: REAL_CH_NET_ASSETS,
  };
  // Try live Specter. If the API doesn't have this domain (or the call times
  // out), lib/specter falls back to a generic mock that's keyed by demo buyer
  // domains and may give us Merivale-flavoured signals — wrong shape for the
  // real client's actual profile. Substitute a curated healthy-marketplace
  // mock so the agent reasons over signals consistent with the real ledger.
  let specter = await fetchSpecter(REAL_CLIENT_DOMAIN, REAL_CLIENT_NAME);
  if (specter.source === "mock") {
    specter = realClientSpecterMock();
  }

  return { ledger, ch, specter, recommendedAmount };
}

function realClientSpecterMock(): RealSpecter {
  return {
    source: "mock",
    company: REAL_CLIENT_NAME,
    signals: {
      headcount: 410,
      headcount_growth_90d_pct: 6.4,
      web_traffic_rank: 18_200,
      web_traffic_growth_90d_pct: 12.3,
      funding_total_usd: 173_000_000,
      last_funding_round: { stage: "Series D", amount_usd: 73_000_000, date: "2024-09-15" },
      news_sentiment_30d: 0.34,
      notable_events_90d: [
        "Product launch — instant valuation tool went live",
        "Hiring across engineering and operations",
        "Partnership with major UK insurer announced",
      ],
      executive_changes_90d: 1,
      glassdoor_rating: 4.1,
      health_score: 81,
    },
    fetched_at: new Date().toISOString(),
  };
}

export async function loadRealData(): Promise<Bundle> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = loadInner()
    .then((b) => {
      cache = b;
      inflight = null;
      return b;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// -------------------------------------------------------------------------
// Anonymisation
// -------------------------------------------------------------------------

const REDACTION_TOKENS = [REAL_CLIENT_NAME, "motorway"];

function redactString(s: string): string {
  if (!s) return s;
  let out = s;
  for (const tok of REDACTION_TOKENS) {
    // Case-insensitive global replace, word-boundary-ish.
    const re = new RegExp(tok, "gi");
    out = out.replace(re, "[redacted]");
  }
  return out;
}

function anonLedger(l: RealLedger): RealLedger {
  return {
    buyer: { id: "buy-real-1", name: ANON_BUYER_NAME, industry: ANON_INDUSTRY },
    summary: l.summary,
    // Invoice numbers are supplier-side and don't expose the buyer; pass through
    // unchanged. Defensive redaction in case a buyer-named ref ever sneaks in.
    recentLines: l.recentLines.map((line) => ({
      ...line,
      invoiceNumber: redactString(line.invoiceNumber),
    })),
  };
}

function anonCH(ch: RealCH): RealCH {
  return {
    buyer: { id: "buy-real-1", name: ANON_BUYER_NAME },
    companiesHouseNumber: ANON_CH_NUMBER,
    filingsOnTime: ch.filingsOnTime,
    lastAccountsFiled: ch.lastAccountsFiled,
    ccjs: ch.ccjs,
    netAssets: ch.netAssets,
  };
}

function anonSpecter(sp: RealSpecter): RealSpecter {
  return {
    source: sp.source,
    company: ANON_BUYER_NAME,
    signals: {
      ...sp.signals,
      notable_events_90d: (sp.signals.notable_events_90d ?? []).map(redactString),
    },
    fetched_at: sp.fetched_at,
  };
}

export type AnonymisedBundle = {
  ledger: RealLedger;
  ch: RealCH;
  specter: RealSpecter;
  recommendedAmount: number;
};

export async function loadRealDataAnonymised(): Promise<AnonymisedBundle> {
  const raw = await loadRealData();
  return {
    ledger: anonLedger(raw.ledger),
    ch: anonCH(raw.ch),
    specter: anonSpecter(raw.specter),
    recommendedAmount: raw.recommendedAmount,
  };
}

// Display constants — the supplier UI / mock-data placeholder reads these so
// the anonymised name is defined in exactly one place.
export const REAL_BUYER_DISPLAY = {
  id: "buy-real-1",
  name: ANON_BUYER_NAME,
  industry: ANON_INDUSTRY,
  companiesHouseNumber: ANON_CH_NUMBER,
  domain: ANON_DOMAIN,
};

// -------------------------------------------------------------------------
// Fallback when the Xero subprocess errors (auth expired, network, npx, etc).
// Shape mirrors Northstar's clean-payer pattern: 12 months of on-time paid
// invoices, healthy filings, healthy Specter signals.
// -------------------------------------------------------------------------

function fallbackRecentLines(): LedgerLine[] {
  const start = new Date("2025-09-15");
  const lines: LedgerLine[] = [];
  for (let i = 0; i < 8; i++) {
    const issued = new Date(start);
    issued.setMonth(start.getMonth() + i);
    const due = new Date(issued);
    due.setDate(due.getDate() + 30);
    const paid = new Date(due);
    paid.setDate(paid.getDate() - 3);
    lines.push({
      invoiceNumber: `INV-FB-${String(i + 1).padStart(3, "0")}`,
      issued: issued.toISOString().slice(0, 10),
      due: due.toISOString().slice(0, 10),
      paid: paid.toISOString().slice(0, 10),
      amount: 7000,
      status: "paid",
      daysLate: 0,
    });
  }
  return lines;
}

function buildFallback(): AnonymisedBundle {
  const recent = fallbackRecentLines();
  return {
    ledger: {
      buyer: { id: "buy-real-1", name: ANON_BUYER_NAME, industry: ANON_INDUSTRY },
      summary: {
        totalInvoices: 12,
        paidCount: 12,
        overdueCount: 0,
        lateCount: 0,
        avgDaysLate: 0,
        lastAvg: 0,
        prevAvg: 0,
        trendDelta: 0,
        relationshipMonths: 12,
        totalRevenue: 84_000,
      },
      recentLines: recent,
    },
    ch: {
      buyer: { id: "buy-real-1", name: ANON_BUYER_NAME },
      companiesHouseNumber: ANON_CH_NUMBER,
      filingsOnTime: true,
      lastAccountsFiled: "2025-09-30",
      ccjs: 0,
      netAssets: 22_400_000,
    },
    specter: {
      source: "mock",
      company: ANON_BUYER_NAME,
      signals: {
        headcount: 380,
        headcount_growth_90d_pct: 5.2,
        web_traffic_rank: 22_000,
        web_traffic_growth_90d_pct: 8.4,
        funding_total_usd: 110_000_000,
        last_funding_round: {
          stage: "Series C",
          amount_usd: 67_700_000,
          date: "2024-04-30",
        },
        news_sentiment_30d: 0.31,
        notable_events_90d: ["Q1 trading update — strong listings growth", "Hiring across engineering"],
        executive_changes_90d: 1,
        glassdoor_rating: 4.0,
        health_score: 78,
      },
      fetched_at: new Date().toISOString(),
    },
    recommendedAmount: 7000,
  };
}

// Single entry point used by agent-tools and the route pre-fetch. On any
// failure (auth, network, parsing) we log and serve the clean-payer fallback
// so the demo never hard-fails.
export async function realDataOrFallback(): Promise<AnonymisedBundle> {
  try {
    return await loadRealDataAnonymised();
  } catch (err) {
    console.error("[real-data] live fetch failed, using fallback:", (err as Error).message);
    return buildFallback();
  }
}
