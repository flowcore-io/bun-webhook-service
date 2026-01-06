import { z } from "zod"

// Data Core Created Event Schema
export const dataCoreCreatedSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	tenant: z.string(),
	deleteProtection: z.boolean(),
	accessControl: z.enum(["public", "private"]),
	createdAt: z.string().datetime(),
})

// Data Core Updated Event Schema
export const dataCoreUpdatedSchema = z.object({
	id: z.string().uuid(),
	name: z.string().optional(),
	deleteProtection: z.boolean().optional(),
	accessControl: z.enum(["public", "private"]).optional(),
	updatedAt: z.string().datetime(),
})

// Data Core Deleted Event Schema
export const dataCoreDeletedSchema = z.object({
	id: z.string().uuid(),
	deletedAt: z.string().datetime(),
})

export const Contract = {
	flowType: "data-core.1",
	eventTypes: {
		created: "data-core.created.0",
		updated: "data-core.updated.0",
		deleted: "data-core.deleted.0",
	},
	schemas: {
		created: dataCoreCreatedSchema,
		updated: dataCoreUpdatedSchema,
		deleted: dataCoreDeletedSchema,
	},
} as const
