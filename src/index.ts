import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import tools from "./tools/index.js";

const app = express();
app.use(cors());
app.use(express.json());

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionEntry>();

function createMcpServer(): McpServer {
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

  return server;
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

async function handleMcpRequest(req: Request, res: Response) {
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader)
    ? sessionIdHeader[0]
    : sessionIdHeader;

  let entry: SessionEntry | undefined;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: false,
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    entry = { server, transport };
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: sessão MCP inválida ou ausente",
      },
      id: null,
    });
    return;
  }

  await entry!.transport.handleRequest(req, res, req.body);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    tools: tools.map((t) => t.name),
    version: "1.0.0",
    auth: config.authToken ? "enabled" : "disabled",
    sessions: sessions.size,
  });
});

app.post("/mcp", authMiddleware, handleMcpRequest);

app.get("/mcp", authMiddleware, handleMcpRequest);

app.delete("/mcp", authMiddleware, async (req, res) => {
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader)
    ? sessionIdHeader[0]
    : sessionIdHeader;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const entry = sessions.get(sessionId)!;
  await entry.transport.close();
  sessions.delete(sessionId);
  res.status(200).json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`VPS MCP Server rodando na porta ${config.port}`);
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);
  console.log(`Auth: ${config.authToken ? "habilitado" : "desabilitado"}`);
});
