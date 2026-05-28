#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AdanosClient } from "finance-sentiment";
import { z } from "zod";

const apiKey = process.env.ADANOS_API_KEY;
if (!apiKey) {
  console.error("Error: ADANOS_API_KEY environment variable is required.");
  process.exit(1);
}

const client = new AdanosClient({ apiKey });
const server = new McpServer({ name: "adanos", version: "1.0.0" });

type Source = "reddit" | "news" | "x" | "polymarket" | "crypto";

const SOURCE_ENUM = ["reddit", "news", "x", "polymarket", "crypto"] as const;
const SOURCE_DESC =
  'Data source: "reddit" (Reddit stocks), "news" (financial news), "x" (X/Twitter FinTwit), "polymarket" (prediction markets), "crypto" (Reddit crypto tokens)';

function getNamespace(source: Source): any {
  const map: Record<Source, any> = {
    reddit: client.reddit,
    news: client.news,
    x: client.x,
    polymarket: client.polymarket,
    crypto: client.crypto,
  };
  return map[source];
}

function toText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

server.tool(
  "get_trending",
  "Get stocks or crypto tokens currently trending by buzz score on a given data source.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (1-100, default 20)"),
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
    type: z
      .enum(["stock", "etf", "all"])
      .optional()
      .describe('Filter asset type: "stock", "etf", or "all". Not applicable for crypto source.'),
  },
  async ({ source, limit, from, to, type }) => {
    const ns = getNamespace(source);
    const params: Record<string, unknown> = { limit, from, to };
    if (type && source !== "crypto") params.type = type;
    const result = await ns.trending(params);
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "get_stock_sentiment",
  "Get detailed sentiment data (buzz score, trend, bullish/bearish %, daily breakdown) for a specific stock ticker or crypto token.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    ticker: z
      .string()
      .describe("Stock ticker symbol (e.g. TSLA, AAPL) or crypto symbol (e.g. BTC, ETH)"),
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ source, ticker, from, to }) => {
    const ns = getNamespace(source);
    const result =
      source === "crypto"
        ? await ns.token(ticker, { from, to })
        : await ns.stock(ticker, { from, to });
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "explain_stock",
  "Get an AI-generated natural language explanation of why a stock or crypto token is currently trending.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    ticker: z.string().describe("Stock ticker or crypto symbol"),
  },
  async ({ source, ticker }) => {
    const ns = getNamespace(source);
    const result = await ns.explain(ticker);
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "search_stocks",
  "Search for stocks or crypto tokens by ticker symbol or company/project name.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    query: z.string().describe("Search query: ticker symbol or company name"),
    limit: z.number().int().min(1).max(200).optional().describe("Max results (1-200, default 50)"),
  },
  async ({ source, query, limit }) => {
    const ns = getNamespace(source);
    const result = await ns.search(query, { limit });
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "compare_stocks",
  "Compare sentiment metrics (buzz score, sentiment, trend) for 2-10 stocks or crypto tokens side by side.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    tickers: z
      .array(z.string())
      .min(2)
      .max(10)
      .describe("List of ticker symbols or crypto symbols to compare (2-10 items)"),
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ source, tickers, from, to }) => {
    const ns = getNamespace(source);
    const result = await ns.compare(tickers, { from, to });
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "get_market_sentiment",
  "Get an aggregate snapshot of the overall market mood (total mentions, top drivers, bullish/bearish ratio) from a given data source.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ source, from, to }) => {
    const ns = getNamespace(source);
    const result = await ns.marketSentiment({ from, to });
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "get_stock_mentions",
  "Get raw mention-level data (individual posts, tweets, or articles) for a specific stock. Requires Professional plan.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
    ticker: z.string().describe("Stock ticker or crypto symbol"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max results (1-100, default 50)"),
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ source, ticker, limit, from, to }) => {
    const ns = getNamespace(source);
    const result = await ns.mentions(ticker, { limit, from, to });
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

server.tool(
  "get_stats",
  "Get dataset statistics for a data source: total tracked tickers, update frequency, coverage details.",
  {
    source: z.enum(SOURCE_ENUM).describe(SOURCE_DESC),
  },
  async ({ source }) => {
    const ns = getNamespace(source);
    const result = await ns.stats();
    return { content: [{ type: "text", text: toText(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
