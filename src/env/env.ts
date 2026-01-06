import { Environment, LogLevel, NodeEnv, zBooleanString } from "@flowcore/hono-api"
import { z } from "zod"

const environment = new Environment(
  z.object({
    // Application
    NODE_ENV: z.nativeEnum(NodeEnv).optional().default(NodeEnv.Production),
    LOG_LEVEL: z.nativeEnum(LogLevel).optional().default(LogLevel.Info),
    LOG_PRETTY: zBooleanString.default(false),
    SERVICE_PORT: z.coerce.number().optional().default(3000),

    // Prometheus Metrics
    PROMETHEUS_ENABLED: zBooleanString.default(true),
    PROMETHEUS_METRICS_SECRET: z.string().optional(),
    PROMETHEUS_METRICS_PATH: z.string().optional().default("/metrics"),

    // OpenTelemetry
    OTEL_ENABLED: zBooleanString.default(true),
    OTEL_SERVICE_NAME: z.string().default("bun-webhook-service"),
    OTEL_RUNTIME: z.enum(["node", "bun", "deno"]).default("bun"),
    OTEL_ENDPOINT: z.string().optional(),

    // Flowcore Configuration
    FLOWCORE_WEBHOOK_BASEURL: z.string().optional(),
    FLOWCORE_TENANT: z.string(),
    FLOWCORE_DATA_CORE: z.string(),
    FLOWCORE_TRANSFORMER_SECRET: z.string().optional(),
    FLOWCORE_WEBHOOK_API_KEY: z.string().optional(),

    // Flowcore Authentication
    FLOWCORE_JWKS_URL: z.string(),
    FLOWCORE_IAM_URL: z.string(),
    FLOWCORE_API_KEY_URL: z.string(),

    // Database
    POSTGRES_CONNECTION_STRING: z.string(),
    POSTGRES_LOG_QUERY: zBooleanString.default(false),
  }),
)

export default environment.env
