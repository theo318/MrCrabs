import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "@cursor/sdk";
import { NextRequest } from "next/server";
import { SUPPLIER, getInvoice, getBuyer, ledgerSummary, type LedgerLine } from "@/lib/mock-data";
import { SYSTEM_PROMPT, buildUserMessage, parseDecision } from "@/lib/underwrite-prompt";
import { fetchSpecter, type SpecterResponse } from "@/lib/specter";
import { realDataOrFallback } from "@/lib/real-data";
import { cases, type Case } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOL_BUDGET = 8;

const CURSOR_SYSTEM_PROMPT = `You are MrCrabs, an underwriting agent for B2B invoice finance. Your job is to decide whether to advance funds against a single supplier invoice.
You have three tools:

getLedgerHistory(buyer_id): the supplier's payment history with this buyer
getCompaniesHouse(buyer_id): UK statutory filings on the buyer
getSpecterSignals(buyer_id): live company-health signals for the buyer

You decide which tools to call, in what order, and when you have enough evidence. You may call tools up to ${TOOL_BUDGET} times total. When you have enough, produce a decision.
Decision options:

APPROVE — confidence ≥ 85%, advance funds
DECLINE — confidence ≥ 85% the buyer will not pay or pays too late
ESCALATE — borderline; pass to a human credit analyst

CRITICAL CALIBRATION RULES:

Be honest about confidence. Do not round up to APPROVE just to close.
Escalation is the CORRECT action when signals disagree. It is not a failure.
When the ledger says "fine" but Specter shows a hiring freeze, executive departure, or traffic decline, ESCALATE. Conflicting signals = human decision.
Trend matters more than average. A buyer slipping from 5d late → 38d late over 12 months is more concerning than steady 20d late.
Reference specific numbers in your reasoning. No vague language.

Format your output with these exact markdown headers in this order, then the decision block. Each section must be tight (2-4 sentences) — humans read this in seconds.

## Ledger
<analysis of ledger history, with specific numbers>

## Companies House
<analysis of statutory filings, with specific numbers>

## Specter
<analysis of live company-health signals, with specific numbers>

## Synthesis
<1-3 sentences synthesising the three sources, especially any conflict>

<<<DECISION
verdict: APPROVE | DECLINE | ESCALATE
confidence: <integer 0-100>
advance_pct: <integer 0-100>
fee_bps: <integer>
key_factors: <semicolon-separated phrases, max 4>
escalation_reason: <one sentence if ESCALATE, otherwise empty>
DECISION>>>`;

// Loads everything the UI panels + agent prompt need for a given buyer.
// For "buy-real-1" this routes through lib/real-data → live Xero (anonymised).
// For all other buyers it reads lib/mock-data + lib/specter as before.
async function loadPanels(buyer: NonNullable<ReturnType<typeof getBuyer>>) {
  if (buyer.id === "buy-real-1") {
    const bundle = await realDataOrFallback();
    return {
      ledger: bundle.ledger.summary,
      recentLedger: bundle.ledger.recentLines,
      specter: bundle.specter,
      chSnapshot: {
        filingsOnTime: bundle.ch.filingsOnTime,
        lastAccountsFiled: bundle.ch.lastAccountsFiled,
        ccjs: bundle.ch.ccjs,
        netAssets: bundle.ch.netAssets,
      },
    };
  }
  return {
    ledger: ledgerSummary(buyer),
    recentLedger: buyer.ledger.slice(-8),
    specter: await fetchSpecter(buyer.domain, buyer.name),
    chSnapshot: {
      filingsOnTime: buyer.filingsOnTime,
      lastAccountsFiled: buyer.lastAccountsFiled,
      ccjs: buyer.ccjs,
      netAssets: buyer.netAssets,
    },
  };
}

function summariseToolResult(name: string, result: unknown): string {
  try {
    // The Cursor SDK wraps MCP results in two envelopes:
    //   outer: { status: "success" | "error", value: <inner> }
    //   inner: MCP CallToolResult shape { content: [{ type: "text", text: <string|{text}> }] }
    // Peel both so the formatters below see the raw JSON our tools returned.
    let payload: any = result;
    if (payload && typeof payload === "object" && "value" in payload) {
      payload = payload.value;
    }
    if (payload && typeof payload === "object" && Array.isArray(payload.content)) {
      const block = payload.content.find((c: any) => c?.type === "text" || typeof c?.text !== "undefined");
      let txt: any = block?.text;
      // Some transports nest the text again as { text: { text: "..." } }
      if (txt && typeof txt === "object" && typeof txt.text === "string") txt = txt.text;
      if (typeof txt === "string") {
        try { payload = JSON.parse(txt); } catch { payload = txt; }
      }
    }
    if (name === "getLedgerHistory" && payload?.summary) {
      const s = payload.summary;
      return `${s.totalInvoices} invoices · ${s.overdueCount} overdue · last-4 ${s.lastAvg}d vs prev-4 ${s.prevAvg}d (Δ${s.trendDelta >= 0 ? "+" : ""}${s.trendDelta}d) · revenue £${(s.totalRevenue ?? 0).toLocaleString()}`;
    }
    if (name === "getCompaniesHouse") {
      return `filings ${payload.filingsOnTime ? "on time" : "LATE"} · CCJs ${payload.ccjs} · net assets £${(payload.netAssets ?? 0).toLocaleString()} · last accounts ${payload.lastAccountsFiled}`;
    }
    if (name === "getSpecterSignals" && payload?.signals) {
      const sig = payload.signals;
      return `${payload.source} · health ${sig.health_score}/100 · headcount Δ${sig.headcount_growth_90d_pct}% · traffic Δ${sig.web_traffic_growth_90d_pct}% · sentiment ${sig.news_sentiment_30d}`;
    }
    return typeof payload === "string" ? payload.slice(0, 200) : JSON.stringify(payload).slice(0, 200);
  } catch {
    return "(result)";
  }
}

export async function POST(req: NextRequest) {
  const fallbackReq = req.clone() as NextRequest;
  const { invoiceId } = await req.json();
  const invoice = getInvoice(invoiceId);
  if (!invoice) return new Response("Invoice not found", { status: 404 });
  const buyer = getBuyer(invoice.buyerId);
  if (!buyer) return new Response("Buyer not found", { status: 404 });

  // Pre-fetch snapshots so the case is always complete and the UI panels render
  // up front. The agent will independently re-fetch via tools — that's the demo.
  // loadPanels routes "buy-real-1" through the live Xero / real-data layer.
  const { ledger, recentLedger, specter, chSnapshot } = await loadPanels(buyer);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("context", {
        buyer: {
          id: buyer.id,
          name: buyer.name,
          companiesHouseNumber: buyer.companiesHouseNumber,
          industry: buyer.industry,
        },
        ledger,
        recentLedger,
        companiesHouse: chSnapshot,
        specter,
        invoice,
      });

      // ---- Cursor SDK primary path ----
      let fullText = "";
      let sdkSucceeded = false;
      try {
        if (!process.env.CURSOR_API_KEY) {
          throw new Error("CURSOR_API_KEY not set — falling through to Anthropic");
        }

        const projectRoot = process.cwd();
        const tsxBin = path.join(projectRoot, "node_modules/.bin/tsx");
        const mcpScript = path.join(projectRoot, "lib/mcp-server.ts");
        const sandboxCwd = mkdtempSync(path.join(tmpdir(), "mrcrabs-agent-"));

        const agent = await Agent.create({
          apiKey: process.env.CURSOR_API_KEY,
          name: "mrcrabs",
          model: { id: process.env.CURSOR_MODEL ?? "composer-2" },
          local: { cwd: sandboxCwd },
          mcpServers: {
            underwriting: {
              type: "stdio",
              command: tsxBin,
              args: [mcpScript],
              cwd: projectRoot,
              env: {
                PATH: process.env.PATH ?? "",
                HOME: process.env.HOME ?? "",
                NODE_ENV: process.env.NODE_ENV ?? "development",
                SPECTER_API_KEY: process.env.SPECTER_API_KEY ?? "",
                SPECTER_BASE_URL: process.env.SPECTER_BASE_URL ?? "",
                // Required for buy-real-1: the MCP subprocess spawns its own
                // Xero MCP child to fetch real ledger data, which needs these.
                XERO_CLIENT_ID: process.env.XERO_CLIENT_ID ?? "",
                XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET ?? "",
              },
            },
          },
        });

        const userPrompt = `${CURSOR_SYSTEM_PROMPT}

# UNDERWRITING REQUEST

buyer_id: ${buyer.id}

Invoice
  number: ${invoice.invoiceNumber}
  amount: £${invoice.amount.toLocaleString()}
  issued: ${invoice.issued}
  due: ${invoice.due}
  description: ${invoice.description}

Buyer
  name: ${buyer.name}
  industry: ${buyer.industry}
  companies_house_number: ${buyer.companiesHouseNumber}

Use the three MCP tools (getLedgerHistory, getCompaniesHouse, getSpecterSignals) with buyer_id="${buyer.id}" to gather evidence, then produce the decision block.`;

        const run = await agent.send(userPrompt);
        let toolCallsStarted = 0;
        let cancelled = false;

        for await (const event of run.stream()) {
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type === "text") {
                fullText += block.text;
                send("delta", { text: block.text });
              }
            }
          } else if (event.type === "tool_call") {
            // Cursor wraps MCP calls as { name: "mcp", args: { toolName, args } }.
            // Unwrap so the UI sees the real tool name (e.g. getLedgerHistory).
            let displayName = event.name;
            let displayArgs: unknown = event.args ?? null;
            const wrapper = event.args as { toolName?: string; args?: unknown } | undefined;
            if (event.name === "mcp" && wrapper?.toolName) {
              displayName = wrapper.toolName;
              displayArgs = wrapper.args ?? null;
            }
            if (event.status === "running") {
              toolCallsStarted += 1;
              send("tool_call", { tool: displayName, args: displayArgs });
              if (toolCallsStarted > TOOL_BUDGET && !cancelled) {
                cancelled = true;
                send("delta", { text: `\n\n[orchestrator] tool budget of ${TOOL_BUDGET} exceeded — wrapping up.\n` });
                await run.cancel().catch(() => {});
              }
            } else if (event.status === "completed") {
              send("tool_result", { tool: displayName, summary: summariseToolResult(displayName, event.result) });
            } else if (event.status === "error") {
              send("tool_result", { tool: displayName, summary: `error: ${typeof event.result === "string" ? event.result : JSON.stringify(event.result)}` });
            }
          }
        }

        await run.wait().catch(() => {});
        sdkSucceeded = true;
      } catch (err: any) {
        console.error("[underwrite] Cursor SDK path failed:", err?.message ?? err);
        // fall through to fallback below
      }

      if (sdkSucceeded) {
        const decision = parseDecision(fullText);
        if (!decision) {
          console.error("[underwrite] SDK output had no <<<DECISION>>> block — falling back to Anthropic");
          sdkSucceeded = false;
        } else {
          const newCase: Case = {
            id: `case-${Date.now()}`,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            buyerName: buyer.name,
            buyerId: buyer.id,
            createdAt: new Date().toISOString(),
            reasoning: fullText.replace(/<<<DECISION[\s\S]*?DECISION>>>/, "").trim(),
            decision,
            specterSnapshot: specter,
            ledgerSnapshot: { summary: ledger, recent: recentLedger },
            chSnapshot,
          };
          cases.add(newCase);
          send("decision", { case: newCase });
          send("done", {});
          controller.close();
          return;
        }
      }

      // ---- Anthropic fallback path ----
      try {
        await runAnthropicFallbackInto(fallbackReq, send, controller);
      } catch (err: any) {
        send("error", { message: err?.message ?? "Underwriting failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ============================================================================
// PRESERVED ANTHROPIC FALLBACK
// This is the original single-pass underwriting handler, untouched in logic.
// It is used when the Cursor SDK path errors or produces an unparseable output.
// runAnthropicFallback is the standalone entry point that returns a full SSE
// Response, identical to the pre-rewire behaviour. runAnthropicFallbackInto is
// a thin adapter used by POST() so that the SDK and fallback paths share one
// SSE controller (and one `context` event).
// ============================================================================

async function runAnthropicFallback(req: NextRequest) {
  const { invoiceId } = await req.json();
  const invoice = getInvoice(invoiceId);
  if (!invoice) return new Response("Invoice not found", { status: 404 });
  const buyer = getBuyer(invoice.buyerId);
  if (!buyer) return new Response("Buyer not found", { status: 404 });

  const { ledger, recentLedger, specter, chSnapshot } = await loadPanels(buyer);

  const userMsg = buildUserMessage({
    invoice: {
      number: invoice.invoiceNumber,
      amount: invoice.amount,
      issued: invoice.issued,
      due: invoice.due,
      description: invoice.description,
    },
    buyer: { name: buyer.name, ch: buyer.companiesHouseNumber, industry: buyer.industry },
    ledger,
    ledgerLines: recentLedger.map((l) => ({
      invoiceNumber: l.invoiceNumber,
      amount: l.amount,
      daysLate: l.daysLate,
      status: l.status,
    })),
    companiesHouse: chSnapshot,
    specter,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("context", {
        buyer: {
          id: buyer.id,
          name: buyer.name,
          companiesHouseNumber: buyer.companiesHouseNumber,
          industry: buyer.industry,
        },
        ledger,
        recentLedger,
        companiesHouse: chSnapshot,
        specter,
        invoice,
      });

      let fullText = "";
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMsg }],
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            send("delta", { text: event.delta.text });
          }
        }
      } catch (err: any) {
        send("error", { message: err.message ?? "Underwriting failed" });
        controller.close();
        return;
      }

      const decision = parseDecision(fullText);
      if (!decision) {
        send("error", { message: "Could not parse decision block from agent output" });
        controller.close();
        return;
      }

      const newCase: Case = {
        id: `case-${Date.now()}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        buyerName: buyer.name,
        buyerId: buyer.id,
        createdAt: new Date().toISOString(),
        reasoning: fullText.replace(/<<<DECISION[\s\S]*?DECISION>>>/, "").trim(),
        decision,
        specterSnapshot: specter,
        ledgerSnapshot: { summary: ledger, recent: recentLedger },
        chSnapshot,
      };
      cases.add(newCase);

      send("decision", { case: newCase });
      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// In-controller variant: streams the same Anthropic logic into an existing
// SSE controller so the primary handler can fall back without re-emitting
// context. The body below mirrors runAnthropicFallback's reasoning loop.
async function runAnthropicFallbackInto(
  req: NextRequest,
  send: (event: string, data: any) => void,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  const { invoiceId } = await req.json();
  const invoice = getInvoice(invoiceId);
  if (!invoice) {
    send("error", { message: "Invoice not found" });
    controller.close();
    return;
  }
  const buyer = getBuyer(invoice.buyerId);
  if (!buyer) {
    send("error", { message: "Buyer not found" });
    controller.close();
    return;
  }

  const { ledger, recentLedger, specter, chSnapshot } = await loadPanels(buyer);

  const userMsg = buildUserMessage({
    invoice: {
      number: invoice.invoiceNumber,
      amount: invoice.amount,
      issued: invoice.issued,
      due: invoice.due,
      description: invoice.description,
    },
    buyer: { name: buyer.name, ch: buyer.companiesHouseNumber, industry: buyer.industry },
    ledger,
    ledgerLines: recentLedger.map((l) => ({
      invoiceNumber: l.invoiceNumber,
      amount: l.amount,
      daysLate: l.daysLate,
      status: l.status,
    })),
    companiesHouse: chSnapshot,
    specter,
  });

  let fullText = "";
  const response = await anthropic.messages.stream({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });
  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      send("delta", { text: event.delta.text });
    }
  }

  const decision = parseDecision(fullText);
  if (!decision) {
    send("error", { message: "Could not parse decision block from agent output" });
    controller.close();
    return;
  }

  const newCase: Case = {
    id: `case-${Date.now()}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.amount,
    buyerName: buyer.name,
    buyerId: buyer.id,
    createdAt: new Date().toISOString(),
    reasoning: fullText.replace(/<<<DECISION[\s\S]*?DECISION>>>/, "").trim(),
    decision,
    specterSnapshot: specter,
    ledgerSnapshot: { summary: ledger, recent: recentLedger },
    chSnapshot,
  };
  cases.add(newCase);

  send("decision", { case: newCase });
  send("done", {});
  controller.close();
}

// silence unused import warning for SUPPLIER (kept available for future routes)
void SUPPLIER;
