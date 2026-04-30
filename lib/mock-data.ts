// Mock supplier-side data. In production this would be pulled from the supplier's Xero.
// Three suppliers, each with a few buyers and outstanding invoices.
// The data is deliberately calibrated so one invoice approves cleanly,
// one declines cleanly, and one is borderline — that's the demo arc.

export type LedgerLine = {
  invoiceNumber: string;
  issued: string; // ISO
  due: string; // ISO
  paid: string | null;
  amount: number; // GBP
  status: "paid" | "outstanding" | "overdue";
  daysLate?: number;
};

export type Buyer = {
  id: string;
  name: string;
  companiesHouseNumber: string;
  domain: string;
  industry: string;
  ledger: LedgerLine[]; // 12 months of history with this supplier
  // Companies House mock signals
  filingsOnTime: boolean;
  lastAccountsFiled: string;
  ccjs: number; // county court judgments
  netAssets: number;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  issued: string;
  due: string;
  amount: number;
  buyerId: string;
  description: string;
};

export type Supplier = {
  id: string;
  name: string;
  industry: string;
  buyers: Buyer[];
  outstanding: Invoice[];
};

// One supplier for the demo — keeps the UI tight.
export const SUPPLIER: Supplier = {
  id: "sup-acme",
  name: "Acme Marketing Ltd",
  industry: "B2B marketing services",
  buyers: [
    // ---- BUYER A: Clean approve ----
    {
      id: "buy-northstar",
      name: "Northstar Retail Group plc",
      companiesHouseNumber: "07432198",
      domain: "northstar-retail.co.uk",
      industry: "Multi-channel retail",
      filingsOnTime: true,
      lastAccountsFiled: "2025-09-14",
      ccjs: 0,
      netAssets: 48_200_000,
      ledger: [
        { invoiceNumber: "ACM-1041", issued: "2025-04-15", due: "2025-05-15", paid: "2025-05-12", amount: 8400, status: "paid" },
        { invoiceNumber: "ACM-1058", issued: "2025-05-15", due: "2025-06-14", paid: "2025-06-11", amount: 8400, status: "paid" },
        { invoiceNumber: "ACM-1074", issued: "2025-06-15", due: "2025-07-15", paid: "2025-07-10", amount: 9200, status: "paid" },
        { invoiceNumber: "ACM-1091", issued: "2025-07-15", due: "2025-08-14", paid: "2025-08-13", amount: 9200, status: "paid" },
        { invoiceNumber: "ACM-1108", issued: "2025-08-15", due: "2025-09-14", paid: "2025-09-12", amount: 9200, status: "paid" },
        { invoiceNumber: "ACM-1125", issued: "2025-09-15", due: "2025-10-15", paid: "2025-10-09", amount: 11200, status: "paid" },
        { invoiceNumber: "ACM-1144", issued: "2025-10-15", due: "2025-11-14", paid: "2025-11-12", amount: 11200, status: "paid" },
        { invoiceNumber: "ACM-1163", issued: "2025-11-15", due: "2025-12-15", paid: "2025-12-12", amount: 11200, status: "paid" },
        { invoiceNumber: "ACM-1182", issued: "2025-12-15", due: "2026-01-14", paid: "2026-01-11", amount: 12400, status: "paid" },
        { invoiceNumber: "ACM-1201", issued: "2026-01-15", due: "2026-02-14", paid: "2026-02-10", amount: 12400, status: "paid" },
        { invoiceNumber: "ACM-1220", issued: "2026-02-15", due: "2026-03-17", paid: "2026-03-13", amount: 12400, status: "paid" },
        { invoiceNumber: "ACM-1239", issued: "2026-03-15", due: "2026-04-14", paid: "2026-04-09", amount: 12400, status: "paid" },
      ],
    },
    // ---- BUYER B: Borderline / ESCALATE ----
    {
      id: "buy-merivale",
      name: "Merivale Hospitality Group Ltd",
      companiesHouseNumber: "09128844",
      domain: "merivale.co",
      industry: "Restaurants & bars",
      filingsOnTime: true,
      lastAccountsFiled: "2025-11-22",
      ccjs: 0,
      netAssets: 4_100_000,
      ledger: [
        { invoiceNumber: "ACM-1042", issued: "2025-04-15", due: "2025-05-15", paid: "2025-05-19", amount: 6500, status: "paid", daysLate: 4 },
        { invoiceNumber: "ACM-1059", issued: "2025-05-15", due: "2025-06-14", paid: "2025-06-15", amount: 6500, status: "paid", daysLate: 1 },
        { invoiceNumber: "ACM-1075", issued: "2025-06-15", due: "2025-07-15", paid: "2025-07-22", amount: 6500, status: "paid", daysLate: 7 },
        { invoiceNumber: "ACM-1092", issued: "2025-07-15", due: "2025-08-14", paid: "2025-08-26", amount: 6500, status: "paid", daysLate: 12 },
        { invoiceNumber: "ACM-1109", issued: "2025-08-15", due: "2025-09-14", paid: "2025-09-29", amount: 7800, status: "paid", daysLate: 15 },
        { invoiceNumber: "ACM-1126", issued: "2025-09-15", due: "2025-10-15", paid: "2025-11-04", amount: 7800, status: "paid", daysLate: 20 },
        { invoiceNumber: "ACM-1145", issued: "2025-10-15", due: "2025-11-14", paid: "2025-12-08", amount: 7800, status: "paid", daysLate: 24 },
        { invoiceNumber: "ACM-1164", issued: "2025-11-15", due: "2025-12-15", paid: "2026-01-14", amount: 7800, status: "paid", daysLate: 30 },
        { invoiceNumber: "ACM-1183", issued: "2025-12-15", due: "2026-01-14", paid: "2026-02-19", amount: 9100, status: "paid", daysLate: 36 },
        { invoiceNumber: "ACM-1202", issued: "2026-01-15", due: "2026-02-14", paid: "2026-03-24", amount: 9100, status: "paid", daysLate: 38 },
        { invoiceNumber: "ACM-1221", issued: "2026-02-15", due: "2026-03-17", paid: "2026-04-28", amount: 9100, status: "paid", daysLate: 42 },
        { invoiceNumber: "ACM-1240", issued: "2026-03-15", due: "2026-04-14", paid: null, amount: 9100, status: "overdue", daysLate: 16 },
      ],
    },
    // ---- BUYER D: Real Xero data, anonymised at the agent-tools boundary ----
    // The fields here are placeholders — only used by the supplier UI to render
    // the tile header (name + industry). Ledger is left empty: getLedgerHistory
    // / getCompaniesHouse / getSpecterSignals all reroute to lib/real-data.ts
    // when buyer_id === "buy-real-1".
    {
      id: "buy-real-1",
      name: "Buyer · UK automotive marketplace",
      companiesHouseNumber: "0XXXXXXX",
      domain: "anonymised.example",
      industry: "Online vehicle marketplace",
      filingsOnTime: true,
      lastAccountsFiled: "2025-09-30",
      ccjs: 0,
      netAssets: 0,
      ledger: [],
    },
    // ---- BUYER C: Clear DECLINE ----
    {
      id: "buy-corvid",
      name: "Corvid Logistics Ltd",
      companiesHouseNumber: "11290033",
      domain: "corvidlogistics.uk",
      industry: "Last-mile logistics",
      filingsOnTime: false,
      lastAccountsFiled: "2024-08-30",
      ccjs: 3,
      netAssets: -820_000,
      ledger: [
        { invoiceNumber: "ACM-1043", issued: "2025-10-15", due: "2025-11-14", paid: "2025-12-22", amount: 4200, status: "paid", daysLate: 38 },
        { invoiceNumber: "ACM-1063", issued: "2025-11-15", due: "2025-12-15", paid: "2026-02-08", amount: 4200, status: "paid", daysLate: 55 },
        { invoiceNumber: "ACM-1084", issued: "2025-12-15", due: "2026-01-14", paid: "2026-03-19", amount: 4200, status: "paid", daysLate: 64 },
        { invoiceNumber: "ACM-1103", issued: "2026-01-15", due: "2026-02-14", paid: null, amount: 4200, status: "overdue", daysLate: 75 },
        { invoiceNumber: "ACM-1122", issued: "2026-02-15", due: "2026-03-17", paid: null, amount: 4200, status: "overdue", daysLate: 44 },
      ],
    },
  ],
  outstanding: [
    {
      id: "inv-1260",
      invoiceNumber: "ACM-1260",
      issued: "2026-04-15",
      due: "2026-05-15",
      amount: 12400,
      buyerId: "buy-northstar",
      description: "Q2 retainer — performance marketing",
    },
    {
      id: "inv-1263",
      invoiceNumber: "ACM-1263",
      issued: "2026-04-22",
      due: "2026-05-22",
      amount: 7000,
      buyerId: "buy-real-1",
      description: "Live Xero · real underwriting case",
    },
    {
      id: "inv-1262",
      invoiceNumber: "ACM-1262",
      issued: "2026-04-25",
      due: "2026-05-25",
      amount: 4200,
      buyerId: "buy-corvid",
      description: "Driver acquisition campaign — March",
    },
  ],
};

export function getInvoice(id: string): Invoice | undefined {
  return SUPPLIER.outstanding.find((i) => i.id === id);
}

export function getBuyer(id: string): Buyer | undefined {
  return SUPPLIER.buyers.find((b) => b.id === id);
}

// Summarised ledger statistics — what the agent actually consumes
export function ledgerSummary(buyer: Buyer) {
  const paid = buyer.ledger.filter((l) => l.status === "paid");
  const overdue = buyer.ledger.filter((l) => l.status === "overdue");
  const lateCount = paid.filter((l) => (l.daysLate ?? 0) > 0).length;
  const avgDaysLate =
    paid.length === 0
      ? 0
      : paid.reduce((s, l) => s + (l.daysLate ?? 0), 0) / paid.length;

  // Trend: avg days late in last 4 vs previous 4
  const last4 = paid.slice(-4);
  const prev4 = paid.slice(-8, -4);
  const lastAvg = last4.length ? last4.reduce((s, l) => s + (l.daysLate ?? 0), 0) / last4.length : 0;
  const prevAvg = prev4.length ? prev4.reduce((s, l) => s + (l.daysLate ?? 0), 0) / prev4.length : 0;
  const trendDelta = lastAvg - prevAvg;

  return {
    totalInvoices: buyer.ledger.length,
    paidCount: paid.length,
    overdueCount: overdue.length,
    lateCount,
    avgDaysLate: Math.round(avgDaysLate * 10) / 10,
    lastAvg: Math.round(lastAvg * 10) / 10,
    prevAvg: Math.round(prevAvg * 10) / 10,
    trendDelta: Math.round(trendDelta * 10) / 10,
    relationshipMonths: buyer.ledger.length,
    totalRevenue: buyer.ledger.reduce((s, l) => s + l.amount, 0),
  };
}
