import { db } from "@/database";
import { flowTypes } from "@/database/tables";
import type {
  flowTypeCreatedSchema,
  flowTypeDeletedSchema,
  flowTypeUpdatedSchema,
} from "@/pathways/contracts/flowcore-platform/flow-type.1";
import { redisService } from "@/services/redis.service";
import type { FlowcoreEvent } from "@flowcore/pathways";
import { eq } from "drizzle-orm";
import type { z } from "zod";

// Handler for flow-type.created.0
export async function handleFlowTypeCreated(
  event: FlowcoreEvent<z.infer<typeof flowTypeCreatedSchema>>
) {
  await db
    .insert(flowTypes)
    .values({
      id: event.payload.id,
      dataCoreId: event.payload.dataCoreId,
      name: event.payload.name,
      sourceEventId: event.eventId,
    })
    .onConflictDoUpdate({
      target: flowTypes.id,
      set: {
        dataCoreId: event.payload.dataCoreId,
        name: event.payload.name,
        updatedAt: new Date(),
        sourceEventId: event.eventId,
      },
    });

  // Invalidate Redis cache for this flow type
  try {
    await redisService.invalidateFlowType(event.payload.dataCoreId, event.payload.name);
  } catch (error) {
    // Redis error - log but don't fail handler
    console.warn("Failed to invalidate Redis cache for flow type", error);
  }
}

// Handler for flow-type.updated.0
export async function handleFlowTypeUpdated(
  event: FlowcoreEvent<z.infer<typeof flowTypeUpdatedSchema>>
) {
  const updateData: Partial<typeof flowTypes.$inferInsert> = {
    updatedAt: new Date(),
    sourceEventId: event.eventId,
  };

  if (event.payload.name !== undefined) updateData.name = event.payload.name;

  await db.update(flowTypes).set(updateData).where(eq(flowTypes.id, event.payload.id));

  // Get the flow type to invalidate cache
  const flowType = await db
    .select()
    .from(flowTypes)
    .where(eq(flowTypes.id, event.payload.id))
    .limit(1);
  if (flowType[0]) {
    await redisService.invalidateFlowType(flowType[0].dataCoreId, flowType[0].name);
  }
}

// Handler for flow-type.deleted.0
export async function handleFlowTypeDeleted(
  event: FlowcoreEvent<z.infer<typeof flowTypeDeletedSchema>>
) {
  // Get the flow type before deleting to invalidate cache
  const flowType = await db
    .select()
    .from(flowTypes)
    .where(eq(flowTypes.id, event.payload.id))
    .limit(1);

  await db.delete(flowTypes).where(eq(flowTypes.id, event.payload.id));

  // Invalidate Redis cache for this flow type and related event types
  if (flowType[0]) {
    await redisService.invalidateFlowType(flowType[0].dataCoreId, flowType[0].name);
  }
}
