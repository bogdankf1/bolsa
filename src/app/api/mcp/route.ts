// HTTP transport for Bolsa's MCP server. Bearer-token auth so the
// endpoint is safe to expose on Vercel alongside the trading UI.
//
// Stateless: a fresh transport+server is created per request. Vercel
// functions are short-lived so there's nothing to keep warm, and MCP
// session state isn't needed — Claude Code drives the conversation
// from its end.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildBolsaMcpServer } from "@/core/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.BOLSA_MCP_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const query = new URL(req.url).searchParams.get("token");
  const provided = bearer ?? query;
  return provided === expected;
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildBolsaMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
