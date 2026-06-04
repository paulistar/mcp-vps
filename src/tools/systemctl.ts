import { z } from "zod";
import type { McpTool } from "../types.js";
import { formatExecResult, runCommand } from "../utils/exec.js";

const vpsSystemctlTool: McpTool = {
  name: "vps_systemctl",
  description:
    "Gerencia serviços systemd. Ações: status, start, stop, restart, reload, enable, disable, is-active",
  schema: {
    action: z
      .enum(["status", "start", "stop", "restart", "reload", "enable", "disable", "is-active"])
      .describe("Ação systemctl"),
    service: z.string().min(1).describe("Nome do serviço (ex: nginx, docker)"),
  },
  handler: async (args) => {
    const { action, service } = args as { action: string; service: string };

    if (!/^[a-zA-Z0-9@._-]+$/.test(service)) {
      throw new Error("Nome de serviço inválido");
    }

    const result = await runCommand(`systemctl ${action} ${service}`);
    return {
      content: [{ type: "text", text: formatExecResult(result) }],
    };
  },
};

export default vpsSystemctlTool;
