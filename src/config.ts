export const config = {
  port: Number(process.env.PORT || 80),
  authToken: process.env.MCP_AUTH_TOKEN || "",
  execTimeoutMs: Number(process.env.EXEC_TIMEOUT_MS || 30_000),
  maxOutputBytes: Number(process.env.MAX_OUTPUT_BYTES || 512_000),
  defaultCwd: process.env.DEFAULT_CWD || "/",
};
