import { getBuyer, ledgerSummary, type LedgerLine } from "./mock-data";
import { fetchSpecter, type SpecterResponse } from "./specter";

export type LedgerHistoryResult = {
  buyer: { id: string; name: string; industry: string };
  summary: ReturnType<typeof ledgerSummary>;
  recentLines: LedgerLine[];
};

export type CompaniesHouseResult = {
  buyer: { id: string; name: string };
  companiesHouseNumber: string;
  filingsOnTime: boolean;
  lastAccountsFiled: string;
  ccjs: number;
  netAssets: number;
};

export type SpecterSignalsResult = SpecterResponse;

/**
 * Returns the supplier's payment history with the given buyer.
 * Shape: { buyer, summary (paid/overdue/lateCount, avgDaysLate, lastAvg, prevAvg, trendDelta, totalRevenue, ...), recentLines (last 8) }.
 * Throws if buyer_id is unknown so the agent can surface the error immediately.
 */
export async function getLedgerHistory(buyer_id: string): Promise<LedgerHistoryResult> {
  const buyer = getBuyer(buyer_id);
  if (!buyer) throw new Error(`Unknown buyer_id: ${buyer_id}`);
  return {
    buyer: { id: buyer.id, name: buyer.name, industry: buyer.industry },
    summary: ledgerSummary(buyer),
    recentLines: buyer.ledger.slice(-8),
  };
}

/**
 * Returns UK Companies House facts for the given buyer (mocked from lib/mock-data).
 * Shape: { buyer, companiesHouseNumber, filingsOnTime, lastAccountsFiled, ccjs, netAssets }.
 * Throws if buyer_id is unknown.
 */
export async function getCompaniesHouse(buyer_id: string): Promise<CompaniesHouseResult> {
  const buyer = getBuyer(buyer_id);
  if (!buyer) throw new Error(`Unknown buyer_id: ${buyer_id}`);
  return {
    buyer: { id: buyer.id, name: buyer.name },
    companiesHouseNumber: buyer.companiesHouseNumber,
    filingsOnTime: buyer.filingsOnTime,
    lastAccountsFiled: buyer.lastAccountsFiled,
    ccjs: buyer.ccjs,
    netAssets: buyer.netAssets,
  };
}

/**
 * Returns live Specter company-health signals for the given buyer, falling back
 * to a curated per-buyer mock when the API key is missing or the call fails.
 * Shape: SpecterResponse — { source: "live"|"mock", company, signals (health_score, headcount, traffic, sentiment, events, ...), fetched_at }.
 * Throws if buyer_id is unknown.
 */
export async function getSpecterSignals(buyer_id: string): Promise<SpecterSignalsResult> {
  const buyer = getBuyer(buyer_id);
  if (!buyer) throw new Error(`Unknown buyer_id: ${buyer_id}`);
  return fetchSpecter(buyer.domain, buyer.name);
}
