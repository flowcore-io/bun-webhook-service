import env from "@/env"
import { createLogger } from "@/services/logger.service"
import { HonoApi } from "@flowcore/hono-api"
import { healthRouter } from "./health/health"
import { ingestionRouter } from "./v1/ingestion"

export const api = new HonoApi({
  openapi: {
    name: "Bun Webhook Service",
    version: "1.0.0",
    description: "Webhook service for Flowcore event ingestion",
  },
  auth: {
    jwks_url: env.FLOWCORE_JWKS_URL,
    iam_url: env.FLOWCORE_IAM_URL,
    api_key_url: env.FLOWCORE_API_KEY_URL,
  },
  prometheus: {
    enabled: env.PROMETHEUS_ENABLED,
    secret: env.PROMETHEUS_METRICS_SECRET,
    path: env.PROMETHEUS_METRICS_PATH,
  },
  otel: {
    enabled: env.OTEL_ENABLED,
  },
  logger: createLogger("hono-api"),
})

api.addRouter("/health", healthRouter)
api.addRouter("/api/v1", ingestionRouter)
