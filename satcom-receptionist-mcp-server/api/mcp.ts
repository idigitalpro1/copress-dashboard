import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTakeMessageTool } from "../src/tools/take-message.js";
import { registerListDepartmentsTool } from "../src/tools/list-departments.js";

type ApiRequest = IncomingMessage & { method?: string; body?: unknown };
type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authToken = process.env.MCP_AUTH_TOKEN;
  if (!authToken) {
    res.status(500).json({ error: "MCP_AUTH_TOKEN is not configured on this deployment" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader !== `Bearer ${authToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // One MCP server instance + transport per request: stateless, matches
  // Vercel's serverless invocation model and avoids request-ID collisions
  // across concurrent calls from the ElevenLabs agent.
  const server = new McpServer({ name: "satcom-receptionist-mcp-server", version: "1.0.0" });
  registerTakeMessageTool(server);
  registerListDepartmentsTool(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req as never, res as never, req.body);
}
