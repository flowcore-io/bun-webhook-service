// Setup environment variables before any imports
// This file must be imported first in the test file

if (!process.env.FLOWCORE_TENANT) process.env.FLOWCORE_TENANT = "test-tenant"
if (!process.env.FLOWCORE_DATA_CORE) process.env.FLOWCORE_DATA_CORE = "test-datacore"
if (!process.env.FLOWCORE_JWKS_URL)
	process.env.FLOWCORE_JWKS_URL = "http://localhost:8888/.well-known/jwks.json"
if (!process.env.FLOWCORE_IAM_URL) process.env.FLOWCORE_IAM_URL = "http://localhost:8888"
if (!process.env.FLOWCORE_API_KEY_URL)
	process.env.FLOWCORE_API_KEY_URL = "http://localhost:8888/api/v1/api-keys"
if (!process.env.POSTGRES_CONNECTION_STRING) {
	// Use 127.0.0.1 instead of localhost in CI environments (GitHub Actions)
	const dbHost = process.env.CI === "true" ? "127.0.0.1" : "localhost"
	process.env.POSTGRES_CONNECTION_STRING =
		`postgresql://postgres:test@${dbHost}:54321/bun_webhook_service_test`
}
if (!process.env.SERVICE_PORT) process.env.SERVICE_PORT = "3000"
if (!process.env.REDIS_SENTINEL_HOSTS) {
	const redisHost = process.env.CI === "true" ? "127.0.0.1" : "localhost"
	process.env.REDIS_SENTINEL_HOSTS = `${redisHost}:26380`
}
if (!process.env.REDIS_SENTINEL_MASTER_NAME) process.env.REDIS_SENTINEL_MASTER_NAME = "mymaster"
if (!process.env.NATS_URL) {
	const natsHost = process.env.CI === "true" ? "127.0.0.1" : "localhost"
	process.env.NATS_URL = `nats://${natsHost}:14222`
}
