import { loggerFactory } from "@flowcore/hono-api"
import env from "@/env"

const factory = loggerFactory({
  prettyPrintLogs: env.LOG_PRETTY,
  logLevel: env.LOG_LEVEL,
})

export function createLogger(name: string) {
  return factory.createLogger(name)
}
