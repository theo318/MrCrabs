# MrCrabs

**Agentic invoice finance, with the human in the loop where it counts.**

Built at the Cursor × Briefcase London hackathon, April 2026. Track 02: Financial Intelligence.

---

## The pitch

Existing invoice finance underwriting is slow because credit analysts have to manually triangulate three data sources for every advance request: the supplier's payment history with the buyer, public filings, and any soft signals about the buyer's health. They do this in 30 minutes per case. We do it in 8 seconds — and we *know* when not to.

MrCrabs reads:

1. **Ledger history** — the supplier's full Xero history with this specific buyer
2. **Specter signals** — live company-health data (hiring, traffic, news, executive changes)
3. **Companies House** — UK statutory filings (punctuality, CCJs, net assets)

…and produces a calibrated decision: APPROVE, DECLINE, or — critically — ESCALATE.

The thesis: **human-out-of-the-loop fails when the agent doesn't know what it doesn't know.** Confidence calibration is the product. The agent's job isn't to always decide; it's to know when the data says "yes," when it says "no," and when it says "this needs a human."

## Demo arc — 90 seconds

1. **Northstar Retail** invoice (£12,400). Strong ledger, healthy Specter, clean Companies House. Agent **APPROVES** in ~8s, advance 90% at 180bps.
2. **Merivale Hospitality** invoice (£9,100). Ledger shows payment slippage from 5 → 38 days late over a year. Specter flags hiring freeze, CMO departure, traffic decline. Companies House is fine. **Signals disagree.** Agent **ESCALATES** at 62% confidence.
3. Switch to analyst desk. Case is in the queue with the agent's reasoning, the three data panels side-by-side, and the explicit conflict surfaced. Analyst overrides — say, declines — and the audit log captures it.
4. **Corvid Logistics** (£4,200). Worst case. Ledger shows escalating lateness, two overdue. Specter says health 22/100, headcount down 34%. Companies House: 3 CCJs, late filings, negative net assets. **DECLINE** at 95% confidence.

## Stack

- **Next.js 14** (App Router, server components for routing, client components for streams)
- **Anthropic SDK** — Claude Sonnet 4.5 for underwriting reasoning, streamed via SSE
- **Specter API** — live company-health signals (with curated fallback per buyer)
- **TailwindCSS** — for the editorial / credit-memo aesthetic
- **Companies House** + **Xero** — mocked in `lib/mock-data.ts` for the demo (production: real APIs)

## Run it

```bash
cp .env.local.example .env.local
# Fill in ANTHROPIC_API_KEY (and SPECTER_API_KEY if you have one)

npm install
npm run dev
# open http://localhost:3000
```

Visit:

- `/` — landing
- `/supplier` — supplier console (request advances)
- `/analyst` — credit analyst desk (handle escalations)

## Notes for judges

- **Specter integration is real.** If `SPECTER_API_KEY` is set, the underwrite endpoint calls Specter's company lookup live. If it's missing or the call fails, we drop to a curated mock per buyer so the demo flow is robust. The real-vs-mock source is shown in the data panel.
- **Cursor SDK** — the underwriting prompt and decision-block parser were iterated in Cursor; the agent's behaviour (system prompt, calibration rules, escalation criterion) is deliberately structured so it could be lifted into a Cursor SDK programmatic agent for batch underwriting.
- **Confidence calibration** is honest: the agent is told that escalation is not a failure, and the demo deliberately includes a case where it correctly chooses to escalate rather than guess.
- **Audit trail** — every override has notes captured, timestamped, and logged.

## Files of interest

- `lib/underwrite-prompt.ts` — the agent's system prompt and decision schema
- `lib/specter.ts` — Specter client (live + curated fallback)
- `app/api/underwrite/route.ts` — the streaming underwriting endpoint
- `app/supplier/page.tsx` — supplier console
- `app/analyst/page.tsx` — analyst desk
