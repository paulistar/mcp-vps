import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import tools from "./tools/index.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = new McpServer({
  name: "vps-mcp-server",
  version: "1.0.0",
});

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.schema, async (args) => {
    try {
      return await tool.handler(args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Erro: ${message}` }],
      };
    }
  });
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.authToken) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : header;

  if (token !== config.authToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    tools: tools.map((t) => t.name),
    version: "1.0.0",
    auth: config.authToken ? "enabled" : "disabled",
  });
});

app.post("/mcp", authMiddleware, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", authMiddleware, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.delete("/mcp", authMiddleware, async (_req, res) => {
  res.status(405).json({ error: "Stateless server" });
});

app.listen(config.port, () => {
  console.log(`VPS MCP Server rodando na porta ${config.port}`);
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);
  console.log(`Auth: ${config.authToken ? "habilitado" : "desabilitado"}`);
});
