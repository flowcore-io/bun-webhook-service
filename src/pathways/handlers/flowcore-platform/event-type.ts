import { db } from "@/database";
import { eventTypes } from "@/database/tables";
import type {
  eventTypeCreatedSchema,
  eventTypeDeletedSchema,
  eventTypeUpdatedSchema,
} from "@/pathways/contracts/flowcore-platform/event-type.1";
import { redisService } from "@/services/redis.service";
import type { FlowcoreEvent } from "@flowcore/pathways";
import { eq } from "drizzle-orm";
import type { z } from "zod";

// Handler for event-type.created.0
export async function handleEventTypeCreated(
  event: FlowcoreEvent<z.infer<typeof eventTypeCreatedSchema>>
) {
  await db
    .insert(eventTypes)
    .values({
      id: event.payload.id,
      flowTypeId: event.payload.flowTypeId,
      name: event.payload.name,
      sourceEventId: event.eventId,
    })
    .onConflictDoUpdate({
      target: eventTypes.id,
      set: {
        flowTypeId: event.payload.flowTypeId,
        name: event.payload.name,
        updatedAt: new Date(),
        sourceEventId: event.eventId,
      },
    });

  // Invalidate Redis cache for this event type
  try {
    await redisService.invalidateEventType(event.payload.flowTypeId, event.payload.name);
  } catch (error) {
    // Redis error - log but don't fail handler
    console.warn("Failed to invalidate Redis cache for event type", error);
  }
}

// Handler for event-type.updated.0
export async function handleEventTypeUpdated(
  event: FlowcoreEvent<z.infer<typeof eventTypeUpdatedSchema>>
) {
  const updateData: Partial<typeof eventTypes.$inferInsert> = {
    updatedAt: new Date(),
    sourceEventId: event.eventId,
  };

  if (event.payload.name !== undefined) updateData.name = event.payload.name;

  await db.update(eventTypes).set(updateData).where(eq(eventTypes.id, event.payload.id));

  // Get the event type to invalidate cache
  const eventType = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, event.payload.id))
    .limit(1);
  if (eventType[0]) {
    await redisService.invalidateEventType(eventType[0].flowTypeId, eventType[0].name);
  }
}

// Handler for event-type.deleted.0
export async function handleEventTypeDeleted(
  event: FlowcoreEvent<z.infer<typeof eventTypeDeletedSchema>>
) {
  // Get the event type before deleting to invalidate cache
  const eventType = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, event.payload.id))
    .limit(1);

  await db.delete(eventTypes).where(eq(eventTypes.id, event.payload.id));

  // Invalidate Redis cache for this event type
  if (eventType[0]) {
    await redisService.invalidateEventType(eventType[0].flowTypeId, eventType[0].name);
  }
}
