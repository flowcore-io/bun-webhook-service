import { z } from "zod"

// Flow Type Created Event Schema
export const flowTypeCreatedSchema = z.object({
	id: z.string().uuid(),
	dataCoreId: z.string().uuid(),
	name: z.string(),
	createdAt: z.string().datetime(),
})

// Flow Type Updated Event Schema
export const flowTypeUpdatedSchema = z.object({
	id: z.string().uuid(),
	name: z.string().optional(),
	updatedAt: z.string().datetime(),
})

// Flow Type Deleted Event Schema
export const flowTypeDeletedSchema = z.object({
	id: z.string().uuid(),
	deletedAt: z.string().datetime(),
})

export const Contract = {
	flowType: "flow-type.1",
	eventTypes: {
		created: "flow-type.created.0",
		updated: "flow-type.updated.0",
		deleted: "flow-type.deleted.0",
	},
	schemas: {
		created: flowTypeCreatedSchema,
		updated: flowTypeUpdatedSchema,
		deleted: flowTypeDeletedSchema,
	},
} as const
