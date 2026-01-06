import { db } from "@/database";
import { dataCores } from "@/database/tables";
import type {
  dataCoreCreatedSchema,
  dataCoreDeletedSchema,
  dataCoreUpdatedSchema,
} from "@/pathways/contracts/flowcore-platform/data-core.1";
import { redisService } from "@/services/redis.service";
import type { FlowcoreEvent } from "@flowcore/pathways";
import { eq } from "drizzle-orm";
import type { z } from "zod";

// Handler for data-core.created.0
export async function handleDataCoreCreated(
  event: FlowcoreEvent<z.infer<typeof dataCoreCreatedSchema>>
) {
  await db
    .insert(dataCores)
    .values({
      id: event.payload.id,
      name: event.payload.name,
      tenant: event.payload.tenant,
      deleteProtection: event.payload.deleteProtection,
      accessControl: event.payload.accessControl,
      sourceEventId: event.eventId,
    })
    .onConflictDoUpdate({
      target: dataCores.id,
      set: {
        name: event.payload.name,
        tenant: event.payload.tenant,
        deleteProtection: event.payload.deleteProtection,
        accessControl: event.payload.accessControl,
        updatedAt: new Date(),
        sourceEventId: event.eventId,
      },
    });

  // Invalidate Redis cache for this data core
  try {
    await redisService.invalidateDataCore(event.payload.tenant, event.payload.name);
  } catch (error) {
    // Redis error - log but don't fail handler
    console.warn("Failed to invalidate Redis cache for data core", error);
  }
}

// Handler for data-core.updated.0
export async function handleDataCoreUpdated(
  event: FlowcoreEvent<z.infer<typeof dataCoreUpdatedSchema>>
) {
  const updateData: Partial<typeof dataCores.$inferInsert> = {
    updatedAt: new Date(),
    sourceEventId: event.eventId,
  };

  if (event.payload.name !== undefined) updateData.name = event.payload.name;
  if (event.payload.deleteProtection !== undefined)
    updateData.deleteProtection = event.payload.deleteProtection;
  if (event.payload.accessControl !== undefined)
    updateData.accessControl = event.payload.accessControl;

  await db.update(dataCores).set(updateData).where(eq(dataCores.id, event.payload.id));

  // Get the data core to invalidate cache
  const dataCore = await db
    .select()
    .from(dataCores)
    .where(eq(dataCores.id, event.payload.id))
    .limit(1);
  if (dataCore[0]) {
    await redisService.invalidateDataCore(dataCore[0].tenant, dataCore[0].name);
  }
}

// Handler for data-core.deleted.0
export async function handleDataCoreDeleted(
  event: FlowcoreEvent<z.infer<typeof dataCoreDeletedSchema>>
) {
  // Get the data core before deleting to invalidate cache
  const dataCore = await db
    .select()
    .from(dataCores)
    .where(eq(dataCores.id, event.payload.id))
    .limit(1);

  await db.delete(dataCores).where(eq(dataCores.id, event.payload.id));

  // Invalidate Redis cache for this data core and related resources
  if (dataCore[0]) {
    await redisService.invalidateDataCore(dataCore[0].tenant, dataCore[0].name);
  }
}
