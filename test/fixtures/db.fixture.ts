// Database fixture for test data setup and verification
// Uses @/db - OK because database is external
import { db } from "@/database"
import { dataCores, flowTypes, eventTypes, type DataCore } from "@/database/tables"
import { eq } from "drizzle-orm"

export class TestDatabase {
	async createTestDataCore(data: {
		id: string
		name: string
		tenant: string
		deleteProtection?: boolean
		accessControl?: "public" | "private"
	}): Promise<void> {
		await db
			.insert(dataCores)
			.values({
				id: data.id,
				name: data.name,
				tenant: data.tenant,
				deleteProtection: data.deleteProtection ?? false,
				accessControl: data.accessControl ?? "public",
			})
			.onConflictDoUpdate({
				target: dataCores.id,
				set: {
					name: data.name,
					tenant: data.tenant,
					deleteProtection: data.deleteProtection ?? false,
					accessControl: data.accessControl ?? "public",
					updatedAt: new Date(),
				},
			})
	}

	async createTestFlowType(data: {
		id: string
		dataCoreId: string
		name: string
	}): Promise<void> {
		await db
			.insert(flowTypes)
			.values({
				id: data.id,
				dataCoreId: data.dataCoreId,
				name: data.name,
			})
			.onConflictDoUpdate({
				target: flowTypes.id,
				set: {
					dataCoreId: data.dataCoreId,
					name: data.name,
					updatedAt: new Date(),
				},
			})
	}

	async createTestEventType(data: {
		id: string
		flowTypeId: string
		name: string
	}): Promise<void> {
		await db
			.insert(eventTypes)
			.values({
				id: data.id,
				flowTypeId: data.flowTypeId,
				name: data.name,
			})
			.onConflictDoUpdate({
				target: eventTypes.id,
				set: {
					flowTypeId: data.flowTypeId,
					name: data.name,
					updatedAt: new Date(),
				},
			})
	}

	async truncateAll(): Promise<void> {
		// Cleanup all test data
		await db.delete(eventTypes)
		await db.delete(flowTypes)
		await db.delete(dataCores)
	}

	async verifyDataCore(id: string): Promise<DataCore | null> {
		const result = await db.select().from(dataCores).where(eq(dataCores.id, id)).limit(1)
		return result[0] ?? null
	}
}
