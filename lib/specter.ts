// Specter client.
// Real API: https://api.tryspecter.com — set SPECTER_API_KEY in .env.local.
// We pass company domain as the lookup key.
// If the call fails (rate-limited, network), we fall back to a curated mock per buyer
// that reflects the qualitative story we want each demo case to show.

const SPECTER_BASE = process.env.SPECTER_BASE_URL || "https://api.tryspecter.com";

export type SpecterResponse = {
  source: "live" | "mock";
  company: string;
  signals: {
    headcount: number;
    headcount_growth_90d_pct: number;
    web_traffic_rank?: number;
    web_traffic_growth_90d_pct: number;
    funding_total_usd?: number;
    last_funding_round?: { stage: string; amount_usd: number; date: string } | null;
    news_sentiment_30d: number; // -1 to 1
    notable_events_90d: string[];
    executive_changes_90d: number;
    glassdoor_rating?: number;
    health_score: number; // 0-100 composite
  };
  fetched_at: string;
};

// Curated fallback per buyer — calibrated so the demo arc reads cleanly
const MOCK_BY_DOMAIN: Record<string, SpecterResponse["signals"]> = {
  "northstar-retail.co.uk": {
    headcount: 1840,
    headcount_growth_90d_pct: 4.2,
    web_traffic_rank: 8420,
    web_traffic_growth_90d_pct: 11.4,
    funding_total_usd: 0,
    last_funding_round: null,
    news_sentiment_30d: 0.42,
    notable_events_90d: ["Q4 trading update — like-for-like sales +6.1%", "New CFO appointment (internal promotion)"],
    executive_changes_90d: 1,
    glassdoor_rating: 4.1,
    health_score: 84,
  },
  "merivale.co": {
    headcount: 312,
    headcount_growth_90d_pct: -8.1,
    web_traffic_rank: 142_300,
    web_traffic_growth_90d_pct: -22.7,
    funding_total_usd: 14_500_000,
    last_funding_round: { stage: "Series B", amount_usd: 9_000_000, date: "2024-03-12" },
    news_sentiment_30d: -0.18,
    notable_events_90d: [
      "Two London venue closures announced",
      "CMO departure — replacement not yet appointed",
      "Trade press: 'Hospitality margins squeezed by NI hike'",
    ],
    executive_changes_90d: 3,
    glassdoor_rating: 3.2,
    health_score: 51,
  },
  "corvidlogistics.uk": {
    headcount: 88,
    headcount_growth_90d_pct: -34.0,
    web_traffic_rank: 980_000,
    web_traffic_growth_90d_pct: -54.0,
    funding_total_usd: 2_300_000,
    last_funding_round: { stage: "Seed extension", amount_usd: 800_000, date: "2024-09-01" },
    news_sentiment_30d: -0.61,
    notable_events_90d: [
      "Two CCJs filed by suppliers in last 60 days",
      "Founder LinkedIn post: 'restructuring the business'",
      "Deactivated 40% of driver app accounts",
    ],
    executive_changes_90d: 2,
    glassdoor_rating: 2.4,
    health_score: 22,
  },
};

export async function fetchSpecter(domain: string, companyName: string): Promise<SpecterResponse> {
  const apiKey = process.env.SPECTER_API_KEY;

  if (apiKey) {
    try {
      // Attempt real Specter call. Endpoint shape may need adjusting per their API ref.
      // We try a company lookup by domain.
      const res = await fetch(`${SPECTER_BASE}/v1/companies/lookup?domain=${encodeURIComponent(domain)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        // Don't block the demo if Specter is slow
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = await res.json();
        // Map Specter's shape to our canonical signal set.
        // Field names below are best-effort; adjust once we see a real response.
        const signals = {
          headcount: json.headcount ?? json.employee_count ?? 0,
          headcount_growth_90d_pct: json.headcount_growth_90d_pct ?? json.growth?.headcount_90d ?? 0,
          web_traffic_rank: json.web_traffic_rank ?? json.traffic?.rank,
          web_traffic_growth_90d_pct: json.web_traffic_growth_90d_pct ?? json.traffic?.growth_90d ?? 0,
          funding_total_usd: json.funding_total_usd ?? json.funding?.total_usd,
          last_funding_round: json.last_funding_round ?? json.funding?.last_round ?? null,
          news_sentiment_30d: json.news_sentiment_30d ?? json.news?.sentiment_30d ?? 0,
          notable_events_90d: json.notable_events_90d ?? json.events?.recent ?? [],
          executive_changes_90d: json.executive_changes_90d ?? 0,
          glassdoor_rating: json.glassdoor_rating ?? json.reviews?.glassdoor,
          health_score: json.health_score ?? json.score ?? 50,
        };
        return { source: "live", company: companyName, signals, fetched_at: new Date().toISOString() };
      }
    } catch (e) {
      // fall through to mock
      console.warn("Specter live call failed, using mock:", (e as Error).message);
    }
  }

  const signals = MOCK_BY_DOMAIN[domain] ?? MOCK_BY_DOMAIN["merivale.co"];
  return { source: "mock", company: companyName, signals, fetched_at: new Date().toISOString() };
}
