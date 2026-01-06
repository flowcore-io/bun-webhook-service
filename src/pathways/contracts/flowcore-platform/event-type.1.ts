import { z } from "zod"

// Event Type Created Event Schema
export const eventTypeCreatedSchema = z.object({
	id: z.string().uuid(),
	flowTypeId: z.string().uuid(),
	name: z.string(),
	createdAt: z.string().datetime(),
})

// Event Type Updated Event Schema
export const eventTypeUpdatedSchema = z.object({
	id: z.string().uuid(),
	name: z.string().optional(),
	updatedAt: z.string().datetime(),
})

// Event Type Deleted Event Schema
export const eventTypeDeletedSchema = z.object({
	id: z.string().uuid(),
	deletedAt: z.string().datetime(),
})

export const Contract = {
	flowType: "event-type.1",
	eventTypes: {
		created: "event-type.created.0",
		updated: "event-type.updated.0",
		deleted: "event-type.deleted.0",
	},
	schemas: {
		created: eventTypeCreatedSchema,
		updated: eventTypeUpdatedSchema,
		deleted: eventTypeDeletedSchema,
	},
} as const
