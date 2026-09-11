import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTakeMessageTool } from "./tools/take-message.js";
import { registerListDepartmentsTool } from "./tools/list-departments.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "satcom-receptionist-mcp-server",
    version: "1.0.0"
  });

  registerTakeMessageTool(server);
  registerListDepartmentsTool(server);

  return server;
}

async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("satcom-receptionist-mcp-server running via stdio");
}

async function runHTTP(): Promise<void> {
  const authToken = process.env.MCP_AUTH_TOKEN;
  if (!authToken) {
    console.error("ERROR: MCP_AUTH_TOKEN environment variable is required for HTTP mode.");
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: "satcom-receptionist-mcp-server" });
  });

  app.post("/mcp", async (req, res) => {
    const authHeader = req.header("authorization") ?? "";
    if (authHeader !== `Bearer ${authToken}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // One MCP server instance + transport per request: stateless, avoids
    // request-ID collisions across concurrent calls from the ElevenLabs agent.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.error(`satcom-receptionist-mcp-server listening on http://localhost:${port}/mcp`);
  });
}

const transportMode = process.env.TRANSPORT ?? "stdio";
const run = transportMode === "http" ? runHTTP() : runStdio();

run.catch((error) => {
  console.error("satcom-receptionist-mcp-server failed to start:", error);
  process.exit(1);
});
