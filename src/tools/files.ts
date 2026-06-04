import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpTool } from "../types.js";
import { config } from "../config.js";

function resolveSafePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (resolved.includes("\0")) {
    throw new Error("Caminho inválido");
  }
  return resolved;
}

async function formatDirEntry(entryPath: string, name: string): Promise<string> {
  try {
    const info = await stat(entryPath);
    const type = info.isDirectory() ? "dir" : info.isFile() ? "file" : "other";
    const size = info.isFile() ? ` size=${info.size}` : "";
    const mtime = info.mtime.toISOString();
    return `${type}\t${name}\t${mtime}${size}`;
  } catch {
    return `unknown\t${name}`;
  }
}

const vpsReadFileTool: McpTool = {
  name: "vps_read_file",
  description: "Lê o conteúdo de um arquivo na VPS.",
  schema: {
    path: z.string().min(1).describe("Caminho absoluto ou relativo do arquivo"),
    maxBytes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Limite de bytes a ler (padrão: MAX_OUTPUT_BYTES)"),
  },
  handler: async (args) => {
    const { path: filePath, maxBytes } = args as {
      path: string;
      maxBytes?: number;
    };

    const resolved = resolveSafePath(filePath);
    const limit = maxBytes ?? config.maxOutputBytes;
    const buffer = await readFile(resolved);
    const content =
      buffer.length > limit
        ? Buffer.concat([buffer.subarray(0, limit), Buffer.from("\n\n[... truncado]")])
        : buffer;

    return {
      content: [{ type: "text", text: content.toString("utf8") }],
    };
  },
};

const vpsWriteFileTool: McpTool = {
  name: "vps_write_file",
  description:
    "Escreve ou sobrescreve um arquivo na VPS. Operação destrutiva — confirme o caminho antes de usar.",
  schema: {
    path: z.string().min(1).describe("Caminho do arquivo"),
    content: z.string().describe("Conteúdo a gravar"),
    append: z
      .boolean()
      .optional()
      .describe("Se true, adiciona ao final do arquivo em vez de sobrescrever"),
  },
  handler: async (args) => {
    const { path: filePath, content, append } = args as {
      path: string;
      content: string;
      append?: boolean;
    };

    const resolved = resolveSafePath(filePath);

    if (append) {
      const existing = await readFile(resolved, "utf8").catch(() => "");
      await writeFile(resolved, existing + content, "utf8");
    } else {
      await writeFile(resolved, content, "utf8");
    }

    return {
      content: [
        {
          type: "text",
          text: `Arquivo gravado: ${resolved}${append ? " (append)" : ""}`,
        },
      ],
    };
  },
};

const vpsListDirTool: McpTool = {
  name: "vps_list_dir",
  description: "Lista entradas de um diretório na VPS com tipo, data e tamanho.",
  schema: {
    path: z
      .string()
      .min(1)
      .describe("Caminho do diretório (padrão: / se omitido)")
      .optional(),
  },
  handler: async (args) => {
    const { path: dirPath } = args as { path?: string };
    const resolved = resolveSafePath(dirPath || "/");
    const entries = await readdir(resolved);
    const lines = await Promise.all(
      entries.map((name) => formatDirEntry(path.join(resolved, name), name)),
    );

    return {
      content: [
        {
          type: "text",
          text: [`directory: ${resolved}`, "", ...lines].join("\n"),
        },
      ],
    };
  },
};

export default [vpsReadFileTool, vpsWriteFileTool, vpsListDirTool];
