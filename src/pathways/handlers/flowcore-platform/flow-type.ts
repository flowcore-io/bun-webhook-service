import { db } from "@/database"
import { flowTypes } from "@/database/tables"
import { eq } from "drizzle-orm"
import type { PathwaysBuilder } from "@flowcore/pathways"
import { redisService } from "@/services/redis.service"

// Handler for flow-type.created.0
export async function handleFlowTypeCreated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		dataCoreId: string
		name: string
		createdAt: string
	},
	eventId: string,
) {
	await db
		.insert(flowTypes)
		.values({
			id: payload.id,
			dataCoreId: payload.dataCoreId,
			name: payload.name,
			sourceEventId: eventId,
		})
		.onConflictDoUpdate({
			target: flowTypes.id,
			set: {
				dataCoreId: payload.dataCoreId,
				name: payload.name,
				updatedAt: new Date(),
				sourceEventId: eventId,
			},
		})

	// Invalidate Redis cache for this flow type
	try {
		await redisService.invalidateFlowType(payload.dataCoreId, payload.name)
	} catch (error) {
		// Redis error - log but don't fail handler
		console.warn("Failed to invalidate Redis cache for flow type", error)
	}
}

// Handler for flow-type.updated.0
export async function handleFlowTypeUpdated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		name?: string
		updatedAt: string
	},
	eventId: string,
) {
	const updateData: Partial<typeof flowTypes.$inferInsert> = {
		updatedAt: new Date(),
		sourceEventId: eventId,
	}

	if (payload.name !== undefined) updateData.name = payload.name

	await db.update(flowTypes).set(updateData).where(eq(flowTypes.id, payload.id))

	// Get the flow type to invalidate cache
	const flowType = await db.select().from(flowTypes).where(eq(flowTypes.id, payload.id)).limit(1)
	if (flowType[0]) {
		await redisService.invalidateFlowType(flowType[0].dataCoreId, flowType[0].name)
	}
}

// Handler for flow-type.deleted.0
export async function handleFlowTypeDeleted(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		deletedAt: string
	},
	eventId: string,
) {
	// Get the flow type before deleting to invalidate cache
	const flowType = await db.select().from(flowTypes).where(eq(flowTypes.id, payload.id)).limit(1)

	await db.delete(flowTypes).where(eq(flowTypes.id, payload.id))

	// Invalidate Redis cache for this flow type and related event types
	if (flowType[0]) {
		await redisService.invalidateFlowType(flowType[0].dataCoreId, flowType[0].name)
	}
}
