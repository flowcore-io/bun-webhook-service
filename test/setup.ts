// Setup environment variables before any imports
if (!process.env.FLOWCORE_TENANT) process.env.FLOWCORE_TENANT = "test-tenant";
if (!process.env.FLOWCORE_DATA_CORE) process.env.FLOWCORE_DATA_CORE = "test-datacore";
if (!process.env.FLOWCORE_JWKS_URL)
  process.env.FLOWCORE_JWKS_URL = "http://localhost:8888/.well-known/jwks.json";
if (!process.env.FLOWCORE_IAM_URL) process.env.FLOWCORE_IAM_URL = "http://localhost:8888";
if (!process.env.FLOWCORE_API_KEY_URL)
  process.env.FLOWCORE_API_KEY_URL = "http://localhost:8888/api/v1/api-keys";
if (!process.env.POSTGRES_CONNECTION_STRING) {
  // Use 127.0.0.1 instead of localhost in CI environments (GitHub Actions)
  const dbHost = process.env.CI === "true" ? "127.0.0.1" : "localhost";
  process.env.POSTGRES_CONNECTION_STRING = `postgresql://postgres:test@${dbHost}:54321/bun_webhook_service_test`;
}
if (!process.env.SERVICE_PORT) process.env.SERVICE_PORT = "3000";
if (!process.env.REDIS_SENTINEL_HOSTS) {
  const redisHost = process.env.CI === "true" ? "127.0.0.1" : "localhost";
  process.env.REDIS_SENTINEL_HOSTS = `${redisHost}:26380`;
}
if (!process.env.REDIS_SENTINEL_MASTER_NAME) process.env.REDIS_SENTINEL_MASTER_NAME = "mymaster";
if (!process.env.NATS_URL) {
  const natsHost = process.env.CI === "true" ? "127.0.0.1" : "localhost";
  process.env.NATS_URL = `nats://${natsHost}:14222`;
}

import env from "@/env";
import { zBooleanString } from "@flowcore/hono-api";
import { AppFixture } from "@root/test/fixtures/app.fixture";
import { AuthFixture } from "@root/test/fixtures/auth.fixture";
import {
  servicesDown,
  servicesResetAndMigrate,
  servicesUp,
} from "@root/test/fixtures/services.fixture";
import { WebhookTestFixture } from "@root/test/fixtures/webhook.fixture";
import { afterAll, afterEach, beforeAll } from "bun:test";
import { mockFlowcoreClientAssertConsumed } from "./mocks/flowcore-sdk";

// Export fixtures for use in tests
export const appFixture = new AppFixture();
export const authFixture = new AuthFixture();

// Configure webhook fixture
const webhookBaseUrl = env.FLOWCORE_WEBHOOK_BASEURL || "http://localhost:8888";
const webhookPort = Number(webhookBaseUrl.split(":")[2] || 8888);

export const webhookFixtureClient = new WebhookTestFixture({
  tenant: env.FLOWCORE_TENANT,
  dataCore: env.FLOWCORE_DATA_CORE,
  port: webhookPort,
  secret: env.FLOWCORE_TRANSFORMER_SECRET || "test-secret",
  transformerUrl: `http://localhost:${env.SERVICE_PORT}/transformer`,
});

// Detect CI environment
const isCI = zBooleanString.default(false).parse(Bun.env.CI);

// Setup lifecycle
beforeAll(
  async () => {
    // In CI, start Docker services and migrate database
    if (isCI) {
      await servicesUp();
      await servicesResetAndMigrate();
    }
  },
  120000 // 120 second timeout for setup (services can take up to 60s to start)
);

afterAll(async () => {
  // In CI, stop Docker services
  if (isCI) {
    await servicesDown();
  }
});

// Assert all Flowcore SDK mocks were consumed after each test
afterEach(() => {
  mockFlowcoreClientAssertConsumed();
});
