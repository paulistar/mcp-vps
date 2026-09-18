import { z } from "zod";
import type { McpTool } from "../types.js";
import { formatExecResult, runCommand } from "../utils/exec.js";

const OPS = "node /app/scripts/tg-diretor-ops.cjs";

async function runOps(args: string, timeoutMs = 120000) {
  return runCommand(`${OPS} ${args}`, { timeoutMs });
}

const tgStatusTool: McpTool = {
  name: "tg_diretor_status",
  description:
    "Status do Telegram do Diretor (@mart_diretor_bot): bot getMe, canal OpenClaw, sessão agent:diretor:main. Sem secrets.",
  schema: {},
  handler: async () => {
    const result = await runOps("status", 90000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

const tgNotifyTool: McpTool = {
  name: "tg_diretor_notify",
  description:
    "Aviso ops via Bot API sendMessage direto (sem gateway OpenClaw). Usar quando gateway pode estar degradado. Não cria turn do agent. Preferir isto a tg_diretor_send para alertas.",
  schema: {
    message: z.string().min(1).describe("Texto do aviso ops no DM do Diretor"),
  },
  handler: async (args) => {
    const message = String((args as { message: string }).message);
    const escaped = message.replace(/'/g, "'\\''");
    const result = await runOps(`notify '${escaped}'`, 60000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

const tgSendTool: McpTool = {
  name: "tg_diretor_send",
  description:
    "Envia via canal OpenClaw (message send) no DM 137339320. Preferir tg_diretor_notify para alertas ops; use send quando quiser delivery pelo plugin/canal.",
  schema: {
    message: z.string().min(1).describe("Texto a enviar no DM do Diretor"),
  },
  handler: async (args) => {
    const message = String((args as { message: string }).message);
    const escaped = message.replace(/'/g, "'\\''");
    const result = await runOps(`send '${escaped}'`, 90000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

const tgHistoryTool: McpTool = {
  name: "tg_diretor_history",
  description:
    "Lê tráfego recente do DM Diretor: inbound/outbound nos logs OpenClaw + sessions tail. Use para ver o que Renato mandou e o que o bot respondeu sem pedir confirmação.",
  schema: {
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Quantidade de eventos (padrão 25)"),
  },
  handler: async (args) => {
    const limit = (args as { limit?: number }).limit ?? 25;
    const result = await runOps(`history ${limit}`, 90000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

const tgInboundTool: McpTool = {
  name: "tg_diretor_inbound",
  description:
    "Linhas recentes de inbound/outbound/agent-end do Telegram Diretor nos docker logs (janela em minutos).",
  schema: {
    minutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Janela em minutos (padrão 15)"),
  },
  handler: async (args) => {
    const minutes = (args as { minutes?: number }).minutes ?? 15;
    const result = await runOps(`inbound ${minutes}`, 60000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

const tgSmokeTool: McpTool = {
  name: "tg_diretor_smoke",
  description:
    "Smoke E2E: openclaw agent diretor --deliver no Telegram (default: pede PONG-OK). Retorna reply + deliverySucceeded. Preferir isto a pedir Renato mandar mensagem.",
  schema: {
    message: z
      .string()
      .optional()
      .describe("Prompt opcional; padrão pede PONG-OK"),
  },
  handler: async (args) => {
    const message = (args as { message?: string }).message;
    const arg = message
      ? `smoke '${String(message).replace(/'/g, "'\\''")}'`
      : "smoke";
    const result = await runOps(arg, 220000);
    return { content: [{ type: "text", text: formatExecResult(result) }] };
  },
};

export default [
  tgStatusTool,
  tgNotifyTool,
  tgSendTool,
  tgHistoryTool,
  tgInboundTool,
  tgSmokeTool,
];
