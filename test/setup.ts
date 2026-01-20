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
import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";
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
beforeAll(async () => {
  // In CI, start Docker services and migrate database
  if (isCI) {
    await servicesUp();
    await servicesResetAndMigrate();
  }
  // Start all test fixtures
  await appFixture.start();
  await authFixture.start();
  await webhookFixtureClient.start();
});

afterAll(async () => {
  // In CI, stop Docker services
  if (isCI) {
    await servicesDown();
  }
  // Stop all test fixtures
  await appFixture.stop();
  await authFixture.stop();
  await webhookFixtureClient.stop();
});

// Clear webhook spies before each test
beforeEach(() => webhookFixtureClient.clear());

// Assert all Flowcore SDK mocks were consumed after each test
afterEach(() => {
  mockFlowcoreClientAssertConsumed();
});
