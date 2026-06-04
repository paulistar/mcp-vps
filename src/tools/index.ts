import type { McpTool } from "../types.js";
import vpsExecTool from "./exec.js";
import fileTools from "./files.js";
import vpsSystemInfoTool from "./system.js";
import vpsDockerTool from "./docker.js";
import vpsSystemctlTool from "./systemctl.js";

const tools: McpTool[] = [
  vpsExecTool,
  vpsSystemInfoTool,
  ...fileTools,
  vpsDockerTool,
  vpsSystemctlTool,
];

export default tools;
