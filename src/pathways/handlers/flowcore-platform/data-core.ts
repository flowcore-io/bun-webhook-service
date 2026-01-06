import { db } from "@/database"
import { dataCores } from "@/database/tables"
import { eq } from "drizzle-orm"
import type { PathwaysBuilder } from "@flowcore/pathways"
import { redisService } from "@/services/redis.service"

// Handler for data-core.created.0
export async function handleDataCoreCreated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		name: string
		tenant: string
		deleteProtection: boolean
		accessControl: "public" | "private"
		createdAt: string
	},
	eventId: string,
) {
	await db
		.insert(dataCores)
		.values({
			id: payload.id,
			name: payload.name,
			tenant: payload.tenant,
			deleteProtection: payload.deleteProtection,
			accessControl: payload.accessControl,
			sourceEventId: eventId,
		})
		.onConflictDoUpdate({
			target: dataCores.id,
			set: {
				name: payload.name,
				tenant: payload.tenant,
				deleteProtection: payload.deleteProtection,
				accessControl: payload.accessControl,
				updatedAt: new Date(),
				sourceEventId: eventId,
			},
		})

	// Invalidate Redis cache for this data core
	try {
		await redisService.invalidateDataCore(payload.tenant, payload.name)
	} catch (error) {
		// Redis error - log but don't fail handler
		console.warn("Failed to invalidate Redis cache for data core", error)
	}
}

// Handler for data-core.updated.0
export async function handleDataCoreUpdated(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		name?: string
		deleteProtection?: boolean
		accessControl?: "public" | "private"
		updatedAt: string
	},
	eventId: string,
) {
	const updateData: Partial<typeof dataCores.$inferInsert> = {
		updatedAt: new Date(),
		sourceEventId: eventId,
	}

	if (payload.name !== undefined) updateData.name = payload.name
	if (payload.deleteProtection !== undefined) updateData.deleteProtection = payload.deleteProtection
	if (payload.accessControl !== undefined) updateData.accessControl = payload.accessControl

	await db.update(dataCores).set(updateData).where(eq(dataCores.id, payload.id))

	// Get the data core to invalidate cache
	const dataCore = await db.select().from(dataCores).where(eq(dataCores.id, payload.id)).limit(1)
	if (dataCore[0]) {
		await redisService.invalidateDataCore(dataCore[0].tenant, dataCore[0].name)
	}
}

// Handler for data-core.deleted.0
export async function handleDataCoreDeleted(
	pathways: PathwaysBuilder<any, any>,
	payload: {
		id: string
		deletedAt: string
	},
	eventId: string,
) {
	// Get the data core before deleting to invalidate cache
	const dataCore = await db.select().from(dataCores).where(eq(dataCores.id, payload.id)).limit(1)

	await db.delete(dataCores).where(eq(dataCores.id, payload.id))

	// Invalidate Redis cache for this data core and related resources
	if (dataCore[0]) {
		await redisService.invalidateDataCore(dataCore[0].tenant, dataCore[0].name)
	}
}
