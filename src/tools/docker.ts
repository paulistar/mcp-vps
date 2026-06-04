import { z } from "zod";
import type { McpTool } from "../types.js";
import { formatExecResult, runCommand } from "../utils/exec.js";

const vpsDockerTool: McpTool = {
  name: "vps_docker",
  description:
    "Operações Docker na VPS. Ações: ps, logs, inspect, restart, stop, start, stats, compose-ps, compose-logs, compose-up, compose-down",
  schema: {
    action: z
      .enum([
        "ps",
        "logs",
        "inspect",
        "restart",
        "stop",
        "start",
        "stats",
        "compose-ps",
        "compose-logs",
        "compose-up",
        "compose-down",
      ])
      .describe("Ação Docker a executar"),
    container: z
      .string()
      .optional()
      .describe("Nome ou ID do container (obrigatório para logs/inspect/restart/stop/start)"),
    composeDir: z
      .string()
      .optional()
      .describe("Diretório com docker-compose.yml (obrigatório para compose-*)"),
    tail: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Linhas de log (padrão: 100, para logs e compose-logs)"),
    detach: z
      .boolean()
      .optional()
      .describe("Para compose-up: executar em background (padrão: true)"),
  },
  handler: async (args) => {
    const { action, container, composeDir, tail, detach } = args as {
      action: string;
      container?: string;
      composeDir?: string;
      tail?: number;
      detach?: boolean;
    };

    const lines = tail ?? 100;
    let command: string;

    switch (action) {
      case "ps":
        command = "docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}'";
        break;
      case "logs":
        if (!container) throw new Error("container é obrigatório para action=logs");
        command = `docker logs --tail ${lines} ${container}`;
        break;
      case "inspect":
        if (!container) throw new Error("container é obrigatório para action=inspect");
        command = `docker inspect ${container}`;
        break;
      case "restart":
        if (!container) throw new Error("container é obrigatório para action=restart");
        command = `docker restart ${container}`;
        break;
      case "stop":
        if (!container) throw new Error("container é obrigatório para action=stop");
        command = `docker stop ${container}`;
        break;
      case "start":
        if (!container) throw new Error("container é obrigatório para action=start");
        command = `docker start ${container}`;
        break;
      case "stats":
        command = "docker stats --no-stream --format 'table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}'";
        break;
      case "compose-ps":
        if (!composeDir) throw new Error("composeDir é obrigatório para action=compose-ps");
        command = `cd ${JSON.stringify(composeDir)} && docker compose ps`;
        break;
      case "compose-logs":
        if (!composeDir) throw new Error("composeDir é obrigatório para action=compose-logs");
        command = `cd ${JSON.stringify(composeDir)} && docker compose logs --tail=${lines}`;
        break;
      case "compose-up":
        if (!composeDir) throw new Error("composeDir é obrigatório para action=compose-up");
        command = `cd ${JSON.stringify(composeDir)} && docker compose up ${detach !== false ? "-d" : ""}`;
        break;
      case "compose-down":
        if (!composeDir) throw new Error("composeDir é obrigatório para action=compose-down");
        command = `cd ${JSON.stringify(composeDir)} && docker compose down`;
        break;
      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    const result = await runCommand(command);
    return {
      content: [{ type: "text", text: formatExecResult(result) }],
    };
  },
};

export default vpsDockerTool;
