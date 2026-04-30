#!/usr/bin/env tsx
// Local MCP stdio server that exposes the three underwriting tools to the
// Cursor SDK agent. Spawned as a subprocess by app/api/underwrite/route.ts.
// Logs go to stderr — stdout is reserved for the MCP protocol.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getLedgerHistory, getCompaniesHouse, getSpecterSignals } from "./agent-tools";

const server = new McpServer(
  { name: "mrcrabs-underwriting", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const buyerIdShape = { buyer_id: z.string().describe("Buyer id, e.g. buy-northstar") };

server.tool(
  "getLedgerHistory",
  "Returns the supplier's payment history with the buyer: summary stats (avg days late, trend, total revenue) and the last 8 ledger lines.",
  buyerIdShape,
  async ({ buyer_id }) => {
    const result = await getLedgerHistory(buyer_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "getCompaniesHouse",
  "Returns UK Companies House facts for the buyer: filings on time, last accounts filed, CCJ count, net assets.",
  buyerIdShape,
  async ({ buyer_id }) => {
    const result = await getCompaniesHouse(buyer_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "getSpecterSignals",
  "Returns Specter company-health signals for the buyer (live API or curated mock fallback): headcount trend, web traffic, news sentiment, executive changes, composite health score.",
  buyerIdShape,
  async ({ buyer_id }) => {
    const result = await getSpecterSignals(buyer_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mrcrabs-mcp] connected via stdio");
}

main().catch((err) => {
  console.error("[mrcrabs-mcp] fatal:", err);
  process.exit(1);
});
