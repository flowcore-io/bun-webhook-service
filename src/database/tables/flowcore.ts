import { pgEnum, pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core"

// Access control enum
export const accessControlEnum = pgEnum("access_control", ["public", "private"])

// Data Cores table - stores Flowcore platform data cores
export const dataCores = pgTable(
	"dataCores",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		tenant: text("tenant").notNull(),
		deleteProtection: boolean("deleteProtection").notNull().default(false),
		accessControl: accessControlEnum("accessControl").notNull().default("public"),
		createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
		sourceEventId: text("sourceEventId"),
	},
	(table) => ({
		tenantIdx: index("dataCores_tenant_idx").on(table.tenant),
		nameIdx: index("dataCores_name_idx").on(table.name),
		tenantNameIdx: index("dataCores_tenant_name_idx").on(table.tenant, table.name),
	}),
)

// Flow Types table - stores Flowcore platform flow types
export const flowTypes = pgTable(
	"flowTypes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		dataCoreId: uuid("dataCoreId").notNull(),
		name: text("name").notNull(),
		createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
		sourceEventId: text("sourceEventId"),
	},
	(table) => ({
		dataCoreIdIdx: index("flowTypes_dataCoreId_idx").on(table.dataCoreId),
		nameIdx: index("flowTypes_name_idx").on(table.name),
		dataCoreNameIdx: index("flowTypes_dataCoreId_name_idx").on(table.dataCoreId, table.name),
	}),
)

// Event Types table - stores Flowcore platform event types
export const eventTypes = pgTable(
	"eventTypes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		flowTypeId: uuid("flowTypeId").notNull(),
		name: text("name").notNull(),
		createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
		sourceEventId: text("sourceEventId"),
	},
	(table) => ({
		flowTypeIdIdx: index("eventTypes_flowTypeId_idx").on(table.flowTypeId),
		nameIdx: index("eventTypes_name_idx").on(table.name),
		flowTypeNameIdx: index("eventTypes_flowTypeId_name_idx").on(table.flowTypeId, table.name),
	}),
)

// Flowcore Pathways state table - prevents db:push conflicts
// This table is automatically created by Pathways, but we include it in schema to prevent conflicts
export const pathwayState = pgTable(
	"_pathways_state",
	{
		eventId: text("event_id").primaryKey(),
		processed: boolean("processed").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => ({
		expiresAtIdx: index("pathway_state_expires_at_idx").on(table.expiresAt),
	}),
)

// Type exports for use in fixtures and services
export type DataCore = typeof dataCores.$inferSelect
export type NewDataCore = typeof dataCores.$inferInsert
export type FlowType = typeof flowTypes.$inferSelect
export type NewFlowType = typeof flowTypes.$inferInsert
export type EventType = typeof eventTypes.$inferSelect
export type NewEventType = typeof eventTypes.$inferInsert
