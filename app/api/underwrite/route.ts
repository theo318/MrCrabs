import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { SUPPLIER, getInvoice, getBuyer, ledgerSummary } from "@/lib/mock-data";
import { SYSTEM_PROMPT, buildUserMessage, parseDecision } from "@/lib/underwrite-prompt";
import { fetchSpecter } from "@/lib/specter";
import { cases, type Case } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { invoiceId } = await req.json();
  const invoice = getInvoice(invoiceId);
  if (!invoice) return new Response("Invoice not found", { status: 404 });
  const buyer = getBuyer(invoice.buyerId);
  if (!buyer) return new Response("Buyer not found", { status: 404 });

  const ledger = ledgerSummary(buyer);
  const specter = await fetchSpecter(buyer.domain, buyer.name);

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
    ledgerLines: buyer.ledger.slice(-8).map((l) => ({
      invoiceNumber: l.invoiceNumber,
      amount: l.amount,
      daysLate: l.daysLate,
      status: l.status,
    })),
    companiesHouse: {
      filingsOnTime: buyer.filingsOnTime,
      lastAccountsFiled: buyer.lastAccountsFiled,
      ccjs: buyer.ccjs,
      netAssets: buyer.netAssets,
    },
    specter,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send context up front so the UI can show the data sources before reasoning starts
      send("context", {
        buyer: {
          id: buyer.id,
          name: buyer.name,
          companiesHouseNumber: buyer.companiesHouseNumber,
          industry: buyer.industry,
        },
        ledger,
        recentLedger: buyer.ledger.slice(-8),
        companiesHouse: {
          filingsOnTime: buyer.filingsOnTime,
          lastAccountsFiled: buyer.lastAccountsFiled,
          ccjs: buyer.ccjs,
          netAssets: buyer.netAssets,
        },
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
        ledgerSnapshot: { summary: ledger, recent: buyer.ledger.slice(-8) },
        chSnapshot: {
          filingsOnTime: buyer.filingsOnTime,
          lastAccountsFiled: buyer.lastAccountsFiled,
          ccjs: buyer.ccjs,
          netAssets: buyer.netAssets,
        },
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
