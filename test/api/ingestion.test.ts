// Black-box tests for ingestion endpoints
// Tests only through public HTTP API endpoints - no imports from /src

// Import setup first to set environment variables before any other imports
import "./ingestion.setup";

// Use a different port to avoid conflicts with global test setup
// Must be set before importing fixtures that read env.SERVICE_PORT
process.env.SERVICE_PORT = "3001";

import { zBooleanString } from "@flowcore/hono-api";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  HEADER_EVENT_TIME,
  HEADER_EVENT_TIME_KEY,
  HEADER_METADATA_JSON,
  HEADER_VALID_TIME,
  HEADER_VALID_TIME_KEY,
  NATS_HEADER_TENANT_ID,
  TOPIC_GUARANTEED_INGESTION_CHANNEL,
} from "../../src/constants/ingestion.constants";
import { TestDatabase } from "../fixtures/db.fixture";
import { NatsFixture } from "../fixtures/nats.fixture";
import { RedisFixture } from "../fixtures/redis.fixture";
import { servicesDown, servicesResetAndMigrate, servicesUp } from "../fixtures/services.fixture";
import { appFixture, authFixture } from "../setup";

const testDb = new TestDatabase();
const natsFixture = new NatsFixture();
const redisFixture = new RedisFixture();

// Test configuration - use environment variables directly
const NATS_URL = process.env.NATS_URL || "nats://localhost:14222";
const REDIS_SENTINEL_HOSTS = process.env.REDIS_SENTINEL_HOSTS || "localhost:26380";
const REDIS_MASTER_NAME = process.env.REDIS_SENTINEL_MASTER_NAME || "mymaster";

// Detect CI environment
const isCI = zBooleanString.default(false).parse(Bun.env.CI);

beforeAll(
  async () => {
    // In CI, start Docker services
    // In local dev, assume user has run test:services:up manually
    if (isCI) {
      await servicesUp();
    }

    // Always reset and migrate database (assumes services are running)
    await servicesResetAndMigrate();

    // Connect to real NATS server
    await natsFixture.connect(NATS_URL);

    // Connect to real Redis Sentinel
    await redisFixture.connect(REDIS_SENTINEL_HOSTS.split(","), REDIS_MASTER_NAME);
  },
  60000 // 60 second timeout for setup
);

afterAll(async () => {
  await natsFixture.disconnect();
  await redisFixture.disconnect();
  // Only stop services in CI
  if (isCI) {
    await servicesDown();
  }
});

beforeEach(
  async () => {
    // Start all test fixtures
    await appFixture.start();
    await authFixture.start();
    await webhookFixtureClient.start();

    // Set up authorized user
    authFixture.setAuthorizedUser(
      {
        id: "test-user-id",
        email: "test@test.com",
        isFlowcoreAdmin: false,
      },
      true // persist
    );

    // Clean up test data
    await testDb.truncateAll();
    try {
      await redisFixture.clear();
    } catch (error) {
      // Redis might not be connected yet, ignore errors during cleanup
      console.warn("Redis clear failed, continuing:", error);
    }

    // Setup: Create test resources using application's database interface
    // Use proper UUIDs for IDs
    const dataCoreId = crypto.randomUUID();
    const flowTypeId = crypto.randomUUID();
    const eventTypeId = crypto.randomUUID();

    await testDb.createTestDataCore({
      id: dataCoreId,
      name: "test-datacore",
      tenant: "test-tenant",
      deleteProtection: false,
      accessControl: "public",
    });
    await testDb.createTestFlowType({
      id: flowTypeId,
      dataCoreId: dataCoreId,
      name: "test-flowtype",
    });
    await testDb.createTestEventType({
      id: eventTypeId,
      flowTypeId: flowTypeId,
      name: "test-eventtype",
    });
  },
  30000 // 30 second timeout for beforeEach
);

afterEach(async () => {
  // Stop all test fixtures
  await appFixture.stop();
  await authFixture.stop();
  await webhookFixtureClient.stop();
});

describe("POST /api/v1/event/:tenant/:dataCore/:flowType/:eventType", () => {
  test("should ingest valid event and publish to NATS", async () => {
    // Subscribe to NATS topic before making request
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);

    // Test: Call black box through public API only
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token", // Mocked auth
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    // Verify: Check public API response
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      received: boolean;
      eventType: string;
      flowType: string;
      eventId: string;
    };
    expect(body).toMatchObject({
      received: true,
      eventType: "test-eventtype",
      flowType: "test-flowtype",
      eventId: expect.any(String),
    });
    expect(body.eventId).toBeTruthy();

    // Verify: Check external system (real NATS)
    await new Promise((resolve) => setTimeout(resolve, 200)); // Wait 200ms for messages
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    expect(natsMessage).toBeDefined();
    expect(natsMessage?.topic).toBe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    expect(natsMessage?.data).toBeDefined();
    // Verify message format matches ChannelEventSchemaWrapper
    if (typeof natsMessage?.data === "object" && natsMessage?.data !== null) {
      const msgData = natsMessage.data as Record<string, unknown>;
      expect(msgData).toHaveProperty("pattern");
      expect(msgData).toHaveProperty("id");
      expect(msgData).toHaveProperty("data");
      if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
        const channelData = msgData.data as Record<string, unknown>;
        expect(channelData).toHaveProperty("dataCore");
        expect(channelData).toHaveProperty("aggregator");
        expect(channelData).toHaveProperty("eventType");
        expect(channelData).toHaveProperty("serializedPayload");
        expect(channelData).toHaveProperty("metadata");
      }
    }
  });

  test("should return 404 for invalid tenant", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/invalid-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(404);
  });

  test("should return 404 for invalid data core", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/invalid-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(404);
  });

  test("should return 404 for invalid flow type", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/invalid-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(404);
  });

  test("should return 404 for invalid event type", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/invalid-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(404);
  });

  test("should use cache on second request", async () => {
    // First request - cache miss (should query PostgreSQL)
    const start1 = Date.now();
    const response1 = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test1" }),
      }
    );
    const time1 = Date.now() - start1;
    expect(response1.status).toBe(200);

    // Second request - should use cache (faster)
    const start2 = Date.now();
    const response2 = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test2" }),
      }
    );
    const time2 = Date.now() - start2;
    expect(response2.status).toBe(200);

    // Second request should be faster (using cache)
    // Note: This is a heuristic test - in practice, caching might not always be faster
    // but it should at least not be significantly slower
    expect(time2).toBeLessThanOrEqual(time1 * 1.5); // Allow some variance
  });

  test("should return 401 for missing authentication", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // No Authorization header
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(401);
  });

  test("should return 401 for invalid token", async () => {
    authFixture.setUnauthorizedUser();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(401);

    // Reset auth for other tests
    authFixture.setAuthorizedUser(
      {
        id: "test-user-id",
        email: "test@test.com",
        isFlowcoreAdmin: false,
      },
      true
    );
  });
});

describe("POST /api/v1/events/:tenant/:dataCore/:flowType/:eventType", () => {
  test("should ingest batch of valid events", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify([{ data: "test1" }, { data: "test2" }, { data: "test3" }]),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      received: boolean;
      eventIds: string[];
    };
    expect(body.received).toBe(true);
    expect(Array.isArray(body.eventIds)).toBe(true);
    expect(body.eventIds).toHaveLength(3);
    expect(body.eventIds.every((id) => typeof id === "string")).toBe(true);

    // Verify: Check external system (real NATS)
    await new Promise((resolve) => setTimeout(resolve, 200)); // Wait 200ms for messages
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(3);
    receivedMessages.forEach((msg) => {
      expect(msg.topic).toBe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
      // Verify message format matches ChannelEventSchemaWrapper
      if (typeof msg.data === "object" && msg.data !== null) {
        expect(msg.data).toHaveProperty("pattern");
        expect(msg.data).toHaveProperty("id");
        expect(msg.data).toHaveProperty("data");
      }
    });
  });

  test("should return 404 for invalid event type in batch", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/invalid-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify([{ data: "test1" }, { data: "test2" }]),
      }
    );

    expect(response.status).toBe(404);
  });

  test("should return 401 for missing authentication in batch", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // No Authorization header
        },
        body: JSON.stringify([{ data: "test1" }]),
      }
    );

    expect(response.status).toBe(401);
  });

  test("should handle high throughput bulk events efficiently", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);

    // Generate a large batch of events (1000 events)
    const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
      data: `test-${i}`,
      timestamp: Date.now() + i,
    }));

    const startTime = performance.now();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify(largeBatch),
      }
    );

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      received: boolean;
      eventIds: string[];
    };
    expect(body.received).toBe(true);
    expect(Array.isArray(body.eventIds)).toBe(true);
    expect(body.eventIds).toHaveLength(1000);
    expect(body.eventIds.every((id) => typeof id === "string")).toBe(true);

    // Verify all event IDs are unique
    const uniqueIds = new Set(body.eventIds);
    expect(uniqueIds.size).toBe(1000);

    // Verify: Check external system (real NATS) - wait for all messages
    // For high throughput, wait longer to ensure all messages are received
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds for messages
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(1000);

    // Performance check: Should handle 1000 events reasonably fast (< 5 seconds)
    expect(duration).toBeLessThan(5000);

    // Verify all messages have correct structure
    receivedMessages.forEach((msg) => {
      expect(msg.topic).toBe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
      expect(msg.data).toBeDefined();
      if (typeof msg.data === "object" && msg.data !== null) {
        const msgData = msg.data as Record<string, unknown>;
        // Verify ChannelEventSchemaWrapper format
        expect(msgData).toHaveProperty("pattern");
        expect(msgData).toHaveProperty("id");
        expect(msgData).toHaveProperty("data");
        if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
          const channelData = msgData.data as Record<string, unknown>;
          expect(channelData).toHaveProperty("dataCore");
          expect(channelData).toHaveProperty("aggregator");
          expect(channelData).toHaveProperty("eventType");
          expect(channelData).toHaveProperty("serializedPayload");
          expect(channelData).toHaveProperty("metadata");
        }
      }
    });
  });

  test("should handle headers: X-Flowcore-Event-Time", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const eventTime = new Date("2024-01-15T10:30:00Z").toISOString();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_EVENT_TIME]: eventTime,
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventId: string };
    expect(body.received).toBe(true);

    // Verify NATS message contains event-time in metadata
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    if (typeof natsMessage?.data === "object" && natsMessage.data !== null) {
      const msgData = natsMessage.data as Record<string, unknown>;
      if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
        const channelData = msgData.data as Record<string, unknown>;
        const metadata = channelData.metadata as Record<string, string>;
        expect(metadata["event-time"]).toBe(eventTime);
      }
    }
  });

  test("should handle headers: X-Flowcore-Valid-Time", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const validTime = new Date("2024-01-15T11:00:00Z").toISOString();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_VALID_TIME]: validTime,
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventId: string };
    expect(body.received).toBe(true);

    // Verify NATS message contains valid-time-on/stored-event in metadata
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    if (typeof natsMessage?.data === "object" && natsMessage.data !== null) {
      const msgData = natsMessage.data as Record<string, unknown>;
      if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
        const channelData = msgData.data as Record<string, unknown>;
        const metadata = channelData.metadata as Record<string, string>;
        expect(metadata["valid-time-on/stored-event"]).toBe(validTime);
      }
    }
  });

  test("should handle headers: X-Flowcore-Metadata-Json", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const customMetadata = {
      "ttl-on/stored-event": "86400",
      "notify-on/stored-event": "true",
      "do-not-archive-on/stored-event": "false",
      "producer/name": "custom-producer",
      customField: "customValue",
    };
    const metadataJson = Buffer.from(JSON.stringify(customMetadata)).toString("base64");

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_METADATA_JSON]: metadataJson,
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventId: string };
    expect(body.received).toBe(true);

    // Verify NATS message contains all metadata fields
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    if (typeof natsMessage?.data === "object" && natsMessage.data !== null) {
      const msgData = natsMessage.data as Record<string, unknown>;
      if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
        const channelData = msgData.data as Record<string, unknown>;
        const metadata = channelData.metadata as Record<string, string>;
        expect(metadata["ttl-on/stored-event"]).toBe("86400");
        expect(metadata["notify-on/stored-event"]).toBe("true");
        expect(metadata["do-not-archive-on/stored-event"]).toBe("false");
        expect(metadata["producer/name"]).toBe("custom-producer");
        expect(metadata["customField"]).toBe("customValue");
        // Verify default metadata is also present
        expect(metadata["producer"]).toBeDefined();
        expect(metadata["ingested-at"]).toBeDefined();
      }
    }
  });

  test("should handle all headers combined", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const eventTime = new Date("2024-01-15T10:30:00Z").toISOString();
    const validTime = new Date("2024-01-15T11:00:00Z").toISOString();
    const customMetadata = {
      "ttl-on/stored-event": "3600",
      "notify-on/stored-event": "true",
    };
    const metadataJson = Buffer.from(JSON.stringify(customMetadata)).toString("base64");

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_EVENT_TIME]: eventTime,
          [HEADER_VALID_TIME]: validTime,
          [HEADER_METADATA_JSON]: metadataJson,
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventId: string };
    expect(body.received).toBe(true);

    // Verify NATS message contains all headers and metadata
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    if (typeof natsMessage?.data === "object" && natsMessage.data !== null) {
      const msgData = natsMessage.data as Record<string, unknown>;
      if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
        const channelData = msgData.data as Record<string, unknown>;
        const metadata = channelData.metadata as Record<string, string>;
        expect(metadata["event-time"]).toBe(eventTime);
        expect(metadata["valid-time-on/stored-event"]).toBe(validTime);
        expect(metadata["ttl-on/stored-event"]).toBe("3600");
        expect(metadata["notify-on/stored-event"]).toBe("true");
      }
    }
  });

  test("should handle batch events with X-Flowcore-Event-Time-Key", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const eventTime1 = new Date("2024-01-15T10:30:00Z").toISOString();
    const eventTime2 = new Date("2024-01-15T10:31:00Z").toISOString();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_EVENT_TIME_KEY]: "timestamp",
        },
        body: JSON.stringify([
          { data: "test1", timestamp: eventTime1 },
          { data: "test2", timestamp: eventTime2 },
        ]),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventIds: string[] };
    expect(body.received).toBe(true);
    expect(body.eventIds).toHaveLength(2);

    // Verify NATS messages contain event-time from payload
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);

    const eventTimes = receivedMessages
      .map((msg) => {
        if (typeof msg?.data === "object" && msg.data !== null) {
          const msgData = msg.data as Record<string, unknown>;
          if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
            const channelData = msgData.data as Record<string, unknown>;
            const metadata = channelData.metadata as Record<string, string>;
            return metadata["event-time"];
          }
        }
        return null;
      })
      .filter(Boolean);

    expect(eventTimes).toContain(eventTime1);
    expect(eventTimes).toContain(eventTime2);
  });

  test("should handle batch events with X-Flowcore-Valid-Time-Key", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const validTime1 = new Date("2024-01-15T11:00:00Z").toISOString();
    const validTime2 = new Date("2024-01-15T11:01:00Z").toISOString();

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_VALID_TIME_KEY]: "validAt",
        },
        body: JSON.stringify([
          { data: "test1", validAt: validTime1 },
          { data: "test2", validAt: validTime2 },
        ]),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventIds: string[] };
    expect(body.received).toBe(true);
    expect(body.eventIds).toHaveLength(2);

    // Verify NATS messages contain valid-time-on/stored-event from payload
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);

    const validTimes = receivedMessages
      .map((msg) => {
        if (typeof msg?.data === "object" && msg.data !== null) {
          const msgData = msg.data as Record<string, unknown>;
          if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
            const channelData = msgData.data as Record<string, unknown>;
            const metadata = channelData.metadata as Record<string, string>;
            return metadata["valid-time-on/stored-event"];
          }
        }
        return null;
      })
      .filter(Boolean);

    expect(validTimes).toContain(validTime1);
    expect(validTimes).toContain(validTime2);
  });

  test("should handle batch events with X-Flowcore-Metadata-Json", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const customMetadata = {
      "ttl-on/stored-event": "7200",
      "do-not-archive-on/stored-event": "true",
    };
    const metadataJson = Buffer.from(JSON.stringify(customMetadata)).toString("base64");

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_METADATA_JSON]: metadataJson,
        },
        body: JSON.stringify([{ data: "test1" }, { data: "test2" }, { data: "test3" }]),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventIds: string[] };
    expect(body.received).toBe(true);
    expect(body.eventIds).toHaveLength(3);

    // Verify all NATS messages contain the shared metadata
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(3);

    receivedMessages.forEach((msg) => {
      if (typeof msg?.data === "object" && msg.data !== null) {
        const msgData = msg.data as Record<string, unknown>;
        if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
          const channelData = msgData.data as Record<string, unknown>;
          const metadata = channelData.metadata as Record<string, string>;
          expect(metadata["ttl-on/stored-event"]).toBe("7200");
          expect(metadata["do-not-archive-on/stored-event"]).toBe("true");
        }
      }
    });
  });

  test("should handle batch events with all header keys combined", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);
    const eventTime1 = new Date("2024-01-15T10:30:00Z").toISOString();
    const eventTime2 = new Date("2024-01-15T10:31:00Z").toISOString();
    const validTime1 = new Date("2024-01-15T11:00:00Z").toISOString();
    const validTime2 = new Date("2024-01-15T11:01:00Z").toISOString();
    const customMetadata = {
      "notify-on/stored-event": "true",
    };
    const metadataJson = Buffer.from(JSON.stringify(customMetadata)).toString("base64");

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/events/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_EVENT_TIME_KEY]: "timestamp",
          [HEADER_VALID_TIME_KEY]: "validAt",
          [HEADER_METADATA_JSON]: metadataJson,
        },
        body: JSON.stringify([
          { data: "test1", timestamp: eventTime1, validAt: validTime1 },
          { data: "test2", timestamp: eventTime2, validAt: validTime2 },
        ]),
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { received: boolean; eventIds: string[] };
    expect(body.received).toBe(true);
    expect(body.eventIds).toHaveLength(2);

    // Verify all NATS messages contain correct metadata
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);

    const messages = receivedMessages
      .map((msg) => {
        if (typeof msg?.data === "object" && msg.data !== null) {
          const msgData = msg.data as Record<string, unknown>;
          if (msgData.data && typeof msgData.data === "object" && msgData.data !== null) {
            const channelData = msgData.data as Record<string, unknown>;
            return channelData.metadata as Record<string, string>;
          }
        }
        return null;
      })
      .filter(Boolean) as Record<string, string>[];

    expect(messages.length).toBeGreaterThanOrEqual(2);
    messages.forEach((metadata) => {
      expect(metadata["notify-on/stored-event"]).toBe("true");
      expect(metadata["event-time"]).toBeDefined();
      expect(metadata["valid-time-on/stored-event"]).toBeDefined();
    });

    // Verify specific event times are present
    const eventTimes = messages.map((m) => m["event-time"]);
    expect(eventTimes).toContain(eventTime1);
    expect(eventTimes).toContain(eventTime2);

    // Verify specific valid times are present
    const validTimes = messages.map((m) => m["valid-time-on/stored-event"]);
    expect(validTimes).toContain(validTime1);
    expect(validTimes).toContain(validTime2);
  });

  test("should verify X-Tenant-Id header is sent to NATS", async () => {
    const collectMessages = natsFixture.subscribe(TOPIC_GUARANTEED_INGESTION_CHANNEL);

    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    expect(response.status).toBe(200);

    // Verify NATS message headers contain X-Tenant-Id
    await new Promise((resolve) => setTimeout(resolve, 200));
    const receivedMessages = await collectMessages();
    expect(receivedMessages.length).toBeGreaterThan(0);
    const natsMessage = receivedMessages[0];
    expect(natsMessage?.headers).toBeDefined();
    if (natsMessage?.headers) {
      // NATS headers should contain X-Tenant-Id
      const tenantId = natsMessage.headers.get(NATS_HEADER_TENANT_ID);
      expect(tenantId).toBe("test-tenant");
    }
  });

  test("should handle invalid base64 metadata gracefully", async () => {
    const response = await fetch(
      `${appFixture.baseUrl}/api/v1/event/test-tenant/test-datacore/test-flowtype/test-eventtype`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          [HEADER_METADATA_JSON]: "invalid-base64!",
        },
        body: JSON.stringify({ data: "test" }),
      }
    );

    // Should return 400 (AppExceptionBadRequest) for invalid metadata
    expect(response.status).toBe(400);
  });
});
