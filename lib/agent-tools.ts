import { getBuyer, ledgerSummary, type LedgerLine } from "./mock-data";
import { fetchSpecter, type SpecterResponse } from "./specter";
import { realDataOrFallback } from "./real-data";

const REAL_BUYER_ID = "buy-real-1";

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
 * For "buy-real-1" this hits the real Xero MCP via lib/real-data.ts (anonymised
 * before return); on any error there it serves a clean-payer fallback so the
 * demo never hard-fails. For all other buyer_ids it reads lib/mock-data.
 * Shape: { buyer, summary (paid/overdue/lateCount, avgDaysLate, lastAvg, prevAvg, trendDelta, totalRevenue, ...), recentLines (last 8) }.
 */
export async function getLedgerHistory(buyer_id: string): Promise<LedgerHistoryResult> {
  if (buyer_id === REAL_BUYER_ID) {
    const bundle = await realDataOrFallback();
    return bundle.ledger;
  }
  const buyer = getBuyer(buyer_id);
  if (!buyer) throw new Error(`Unknown buyer_id: ${buyer_id}`);
  return {
    buyer: { id: buyer.id, name: buyer.name, industry: buyer.industry },
    summary: ledgerSummary(buyer),
    recentLines: buyer.ledger.slice(-8),
  };
}

/**
 * Returns UK Companies House facts for the given buyer.
 * For "buy-real-1": real CH data anonymised at the boundary; fallback to a
 * clean-payer shape if the live fetch fails. Otherwise: lib/mock-data.
 * Shape: { buyer, companiesHouseNumber, filingsOnTime, lastAccountsFiled, ccjs, netAssets }.
 */
export async function getCompaniesHouse(buyer_id: string): Promise<CompaniesHouseResult> {
  if (buyer_id === REAL_BUYER_ID) {
    const bundle = await realDataOrFallback();
    return bundle.ch;
  }
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
 * Returns Specter company-health signals.
 * For "buy-real-1": live Specter (or mock fallback) for the real domain,
 * anonymised at the boundary; clean-payer shape if the upstream fetch fails.
 * Otherwise: lib/specter for the buyer's domain.
 * Shape: SpecterResponse — { source: "live"|"mock", company, signals, fetched_at }.
 */
export async function getSpecterSignals(buyer_id: string): Promise<SpecterSignalsResult> {
  if (buyer_id === REAL_BUYER_ID) {
    const bundle = await realDataOrFallback();
    return bundle.specter;
  }
  const buyer = getBuyer(buyer_id);
  if (!buyer) throw new Error(`Unknown buyer_id: ${buyer_id}`);
  return fetchSpecter(buyer.domain, buyer.name);
}
