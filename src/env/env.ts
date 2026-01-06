import { Environment, LogLevel, NodeEnv, zBooleanString } from "@flowcore/hono-api"
import { z } from "zod"
import { TOPIC_GUARANTEED_INGESTION_CHANNEL } from "@/constants/ingestion.constants"

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

    // Redis Sentinel
    REDIS_SENTINEL_HOSTS: z.string().optional(),
    REDIS_SENTINEL_MASTER_NAME: z.string().optional().default("mymaster"),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_CACHE_TTL: z.coerce.number().optional().default(300),
    BUN_PROMISE_CACHE_TTL: z.coerce.number().optional().default(30),

        // NATS
        NATS_URL: z.string().optional().default("nats://localhost:4222"),
        NATS_TOPIC: z.string().optional().default(TOPIC_GUARANTEED_INGESTION_CHANNEL),
  }),
)

export default environment.env
