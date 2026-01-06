import { HonoApiRouter } from "@flowcore/hono-api"
import { z } from "zod"

export const healthRouter = new HonoApiRouter()

healthRouter.get("/health", {
  tags: ["system"],
  summary: "Health check endpoint",
  auth: { optional: true },
  output: z.object({
    status: z.enum(["ok"]),
    runtime: z.string(),
    timestamp: z.string(),
    version: z.string(),
    environment: z.string(),
  }),
  handler: () => ({
    status: "ok" as const,
    runtime: typeof Bun !== "undefined" ? "bun" : "deno",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "production",
  }),
})
