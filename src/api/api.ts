import env from "@/env"
import { createLogger } from "@/services/logger.service"
import { HonoApi } from "@flowcore/hono-api"
import { healthRouter } from "./health/health"
import { ingestionRouter } from "./v1/ingestion"
import { pathways } from "@/pathways"
import { redisService } from "@/services/redis.service"
import { natsService } from "@/services/nats.service"

// Initialize services with retry logic (fixed delay, no exponential backoff)
async function initializeServices() {
	const maxRetries = 10
	const delay = 500 // Fixed 500ms delay between retries
	
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			await redisService.connect()
			await natsService.connect()
			console.log("✅ Services initialized successfully")
			return // Success
		} catch (error) {
			if (attempt === maxRetries - 1) {
				console.error("Failed to initialize services after", maxRetries, "retries:", error)
				// Don't throw - allow app to start even if services fail
				// Services will retry on first use via ensureConnected()
				return
			}
			console.warn(`Service initialization attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`)
			await new Promise((resolve) => setTimeout(resolve, delay))
		}
	}
}

// Initialize services on module load (non-blocking)
initializeServices().catch((error) => {
	console.error("Service initialization error:", error)
	// Don't crash the app - services will retry on first use
})

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

// Add pathways to router (only if not in test mode)
// In tests, pathways might not be fully configured, so we make it optional
if (process.env.NODE_ENV !== "test") {
	try {
		ingestionRouter.withPathways(pathways)
	} catch (error) {
		console.warn("Failed to initialize pathways, continuing without it", error)
	}
}

api.addRouter("/health", healthRouter)
api.addRouter("/api/v1", ingestionRouter)
