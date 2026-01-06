import { db } from "@/database"
import { eventTypes } from "@/database/tables"
import { eq } from "drizzle-orm"
import type { PathwaysBuilder } from "@flowcore/pathways"
import { redisService } from "@/services/redis.service"

// Handler for event-type.created.0
export async function handleEventTypeCreated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		flowTypeId: string
		name: string
		createdAt: string
	},
	eventId: string,
) {
	await db
		.insert(eventTypes)
		.values({
			id: payload.id,
			flowTypeId: payload.flowTypeId,
			name: payload.name,
			sourceEventId: eventId,
		})
		.onConflictDoUpdate({
			target: eventTypes.id,
			set: {
				flowTypeId: payload.flowTypeId,
				name: payload.name,
				updatedAt: new Date(),
				sourceEventId: eventId,
			},
		})

	// Invalidate Redis cache for this event type
	try {
		await redisService.invalidateEventType(payload.flowTypeId, payload.name)
	} catch (error) {
		// Redis error - log but don't fail handler
		console.warn("Failed to invalidate Redis cache for event type", error)
	}
}

// Handler for event-type.updated.0
export async function handleEventTypeUpdated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		name?: string
		updatedAt: string
	},
	eventId: string,
) {
	const updateData: Partial<typeof eventTypes.$inferInsert> = {
		updatedAt: new Date(),
		sourceEventId: eventId,
	}

	if (payload.name !== undefined) updateData.name = payload.name

	await db.update(eventTypes).set(updateData).where(eq(eventTypes.id, payload.id))

	// Get the event type to invalidate cache
	const eventType = await db.select().from(eventTypes).where(eq(eventTypes.id, payload.id)).limit(1)
	if (eventType[0]) {
		await redisService.invalidateEventType(eventType[0].flowTypeId, eventType[0].name)
	}
}

// Handler for event-type.deleted.0
export async function handleEventTypeDeleted(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		deletedAt: string
	},
	eventId: string,
) {
	// Get the event type before deleting to invalidate cache
	const eventType = await db.select().from(eventTypes).where(eq(eventTypes.id, payload.id)).limit(1)

	await db.delete(eventTypes).where(eq(eventTypes.id, payload.id))

	// Invalidate Redis cache for this event type
	if (eventType[0]) {
		await redisService.invalidateEventType(eventType[0].flowTypeId, eventType[0].name)
	}
}
