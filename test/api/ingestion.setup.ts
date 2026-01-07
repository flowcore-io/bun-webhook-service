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
if (!process.env.REDIS_SENTINEL_HOSTS) process.env.REDIS_SENTINEL_HOSTS = "localhost:26380"
if (!process.env.REDIS_SENTINEL_MASTER_NAME) process.env.REDIS_SENTINEL_MASTER_NAME = "mymaster"
if (!process.env.NATS_URL) process.env.NATS_URL = "nats://localhost:14222"
