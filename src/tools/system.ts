import { z } from "zod";
import type { McpTool } from "../types.js";
import { formatExecResult, runCommand } from "../utils/exec.js";

const vpsSystemInfoTool: McpTool = {
  name: "vps_system_info",
  description:
    "Retorna informações do sistema: hostname, uptime, memória, disco, load average e versão do SO.",
  schema: {},
  handler: async () => {
    const result = await runCommand(`
      echo "=== hostname ==="
      hostname
      echo ""
      echo "=== uptime ==="
      uptime
      echo ""
      echo "=== memory ==="
      free -h 2>/dev/null || vm_stat
      echo ""
      echo "=== disk ==="
      df -h
      echo ""
      echo "=== os ==="
      uname -a
    `);

    return {
      content: [{ type: "text", text: formatExecResult(result) }],
    };
  },
};

export default vpsSystemInfoTool;
