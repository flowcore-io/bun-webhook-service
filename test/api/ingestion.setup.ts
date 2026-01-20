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
	process.env.POSTGRES_CONNECTION_STRING =
		"postgresql://postgres:test@localhost:54321/bun_webhook_service_test"
}
if (!process.env.SERVICE_PORT) process.env.SERVICE_PORT = "3000"
// For tests, use direct Redis connection instead of Sentinel to avoid Docker networking issues
// Tests don't need high availability features, so direct connection is simpler and more reliable
if (!process.env.REDIS_SENTINEL_HOSTS) {
	// Don't set REDIS_SENTINEL_HOSTS - this will make the service use direct connection
	// Redis is available on localhost:16379 for tests
}
if (!process.env.NATS_URL) process.env.NATS_URL = "nats://localhost:14222"
