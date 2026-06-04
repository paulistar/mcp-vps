import { z } from "zod";
import type { McpTool } from "../types.js";
import { formatExecResult, runCommand } from "../utils/exec.js";

const vpsExecTool: McpTool = {
  name: "vps_exec",
  description:
    "Executa um comando shell na VPS. Retorna stdout, stderr e exit code. Use para diagnósticos, scripts e operações que não tenham tool dedicado.",
  schema: {
    command: z
      .string()
      .min(1)
      .describe("Comando shell a executar (ex: 'df -h', 'ls -la /var/log')"),
    cwd: z
      .string()
      .optional()
      .describe("Diretório de trabalho (padrão: /)"),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Timeout em ms (padrão: 30000)"),
  },
  handler: async (args) => {
    const { command, cwd, timeoutMs } = args as {
      command: string;
      cwd?: string;
      timeoutMs?: number;
    };

    const result = await runCommand(command, { cwd, timeoutMs });
    return {
      content: [{ type: "text", text: formatExecResult(result) }],
    };
  },
};

export default vpsExecTool;
