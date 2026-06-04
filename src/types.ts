import { z } from "zod";

export interface McpTool {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}
