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

const SSE_KEEPALIVE_MS = 25_000;

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  heartbeat?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, SessionEntry>();

function getSessionId(req: Request): string | undefined {
  const header = req.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
}

function getAuthToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return header;
}

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

function startSseKeepalive(entry: SessionEntry) {
  if (entry.heartbeat) return;

  entry.heartbeat = setInterval(() => {
    try {
      const internal = (
        entry.transport as unknown as {
          _webStandardTransport?: {
            _streamMapping?: Map<
              string,
              { controller?: ReadableStreamDefaultController; encoder?: TextEncoder }
            >;
          };
        }
      )._webStandardTransport;

      const stream = internal?._streamMapping?.get("_GET_stream");
      if (stream?.controller && stream?.encoder) {
        stream.controller.enqueue(stream.encoder.encode(": keepalive\n\n"));
      }
    } catch {
      // stream pode não estar aberto ainda
    }
  }, SSE_KEEPALIVE_MS);
}

function stopSseKeepalive(entry: SessionEntry) {
  if (!entry.heartbeat) return;
  clearInterval(entry.heartbeat);
  entry.heartbeat = undefined;
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.authToken) {
    next();
    return;
  }

  const sessionId = getSessionId(req);

  // Sessão criada via POST autenticado: GET/DELETE usam mcp-session-id
  if (
    sessionId &&
    sessions.has(sessionId) &&
    (req.method === "GET" || req.method === "DELETE")
  ) {
    next();
    return;
  }

  if (getAuthToken(req) !== config.authToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

async function handleMcpPost(req: Request, res: Response) {
  const sessionId = getSessionId(req);
  let entry: SessionEntry | undefined;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: false,
      onsessioninitialized: (id) => {
        sessions.set(id, entry!);
        startSseKeepalive(entry!);
      },
    });

    entry = { server, transport };

    transport.onclose = () => {
      stopSseKeepalive(entry!);
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
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

async function handleMcpStream(req: Request, res: Response) {
  const sessionId = getSessionId(req);

  if (!sessionId || !sessions.has(sessionId)) {
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

  const entry = sessions.get(sessionId)!;

  // Limpa stream SSE órfão quando proxy (Cloudflare) corta a conexão
  entry.transport.closeStandaloneSSEStream();

  await entry.transport.handleRequest(req, res);
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

app.post("/mcp", authMiddleware, handleMcpPost);
app.get("/mcp", authMiddleware, handleMcpStream);
app.delete("/mcp", authMiddleware, handleMcpStream);

app.listen(config.port, () => {
  console.log(`VPS MCP Server rodando na porta ${config.port}`);
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);
  console.log(`Auth: ${config.authToken ? "habilitado" : "desabilitado"}`);
});
