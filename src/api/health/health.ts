import { HonoApiRouter } from "@flowcore/hono-api"
import { z } from "zod"

export const healthRouter = new HonoApiRouter()

healthRouter.get("/health", {
  tags: ["system"],
  summary: "Health check endpoint",
  description: "Returns the health status of the webhook service including runtime information, version, and current timestamp",
  auth: { optional: true },
  output: z.object({
    status: z.enum(["ok"]).describe("Service status, always 'ok' when the endpoint is reachable"),
    runtime: z.string().describe("The runtime environment (e.g., 'bun', 'deno', 'node')"),
    timestamp: z.string().describe("Current server timestamp in ISO 8601 format"),
    version: z.string().describe("The version of the webhook service"),
    environment: z.string().describe("The Node.js environment mode (e.g., 'development', 'production', 'test')"),
  }),
  handler: () => ({
    status: "ok" as const,
    runtime: typeof Bun !== "undefined" ? "bun" : "deno",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "production",
  }),
})
