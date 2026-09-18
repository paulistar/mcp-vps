import type { McpTool } from "../types.js";
import vpsExecTool from "./exec.js";
import fileTools from "./files.js";
import vpsSystemInfoTool from "./system.js";
import vpsDockerTool from "./docker.js";
import vpsSystemctlTool from "./systemctl.js";
import telegramTools from "./telegram.js";

const tools: McpTool[] = [
  vpsExecTool,
  vpsSystemInfoTool,
  ...fileTools,
  vpsDockerTool,
  vpsSystemctlTool,
  ...telegramTools,
];

export default tools;
