import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function truncate(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const truncated = buf.subarray(0, maxBytes).toString("utf8");
  return `${truncated}\n\n[... output truncado em ${maxBytes} bytes]`;
}

export async function runCommand(
  command: string,
  options?: { cwd?: string; timeoutMs?: number },
): Promise<ExecResult> {
  const timeoutMs = options?.timeoutMs ?? config.execTimeoutMs;
  const cwd = options?.cwd ?? config.defaultCwd;

  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: config.maxOutputBytes,
      encoding: "utf8",
    });

    return {
      stdout: truncate(stdout ?? "", config.maxOutputBytes),
      stderr: truncate(stderr ?? "", config.maxOutputBytes),
      exitCode: 0,
    };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
      message?: string;
    };

    if (err.killed) {
      throw new Error(
        `Comando excedeu o timeout de ${timeoutMs}ms. Use um comando mais específico ou aumente EXEC_TIMEOUT_MS.`,
      );
    }

    const exitCode =
      typeof err.code === "number"
        ? err.code
        : err.signal
          ? 128
          : 1;

    return {
      stdout: truncate(err.stdout ?? "", config.maxOutputBytes),
      stderr: truncate(
        err.stderr ?? err.message ?? "Erro desconhecido",
        config.maxOutputBytes,
      ),
      exitCode,
    };
  }
}

export function formatExecResult(result: ExecResult): string {
  const parts: string[] = [`exit_code: ${result.exitCode}`];

  if (result.stdout.trim()) {
    parts.push("", "stdout:", result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    parts.push("", "stderr:", result.stderr.trimEnd());
  }

  return parts.join("\n");
}
