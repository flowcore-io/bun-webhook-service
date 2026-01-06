import env from "@/env"
import { PathwaysBuilder, createPostgresPathwayState } from "@flowcore/pathways"
import { dataCoreContract, flowTypeContract, eventTypeContract } from "./contracts"
import {
	handleDataCoreCreated,
	handleDataCoreUpdated,
	handleDataCoreDeleted,
} from "./handlers/flowcore-platform/data-core"
import {
	handleFlowTypeCreated,
	handleFlowTypeUpdated,
	handleFlowTypeDeleted,
} from "./handlers/flowcore-platform/flow-type"
import {
	handleEventTypeCreated,
	handleEventTypeUpdated,
	handleEventTypeDeleted,
} from "./handlers/flowcore-platform/event-type"

// Create Pathways builder for subscribing to Flowcore platform events
export const pathways = new PathwaysBuilder({
	baseUrl: env.FLOWCORE_WEBHOOK_BASEURL || "https://webhook.api.flowcore.io",
	tenant: "flowcore",
	dataCore: "flowcore-platform",
	apiKey: env.FLOWCORE_WEBHOOK_API_KEY || "",
})
	.withPathwayState(
		createPostgresPathwayState({
			connectionString: env.POSTGRES_CONNECTION_STRING,
			tableName: "_pathways_state",
		}),
	)
	// Register data core events
	.register({
		flowType: dataCoreContract.Contract.flowType,
		eventType: dataCoreContract.Contract.eventTypes.created,
		schema: dataCoreContract.Contract.schemas.created,
	})
	.register({
		flowType: dataCoreContract.Contract.flowType,
		eventType: dataCoreContract.Contract.eventTypes.updated,
		schema: dataCoreContract.Contract.schemas.updated,
	})
	.register({
		flowType: dataCoreContract.Contract.flowType,
		eventType: dataCoreContract.Contract.eventTypes.deleted,
		schema: dataCoreContract.Contract.schemas.deleted,
	})
	// Register flow type events
	.register({
		flowType: flowTypeContract.Contract.flowType,
		eventType: flowTypeContract.Contract.eventTypes.created,
		schema: flowTypeContract.Contract.schemas.created,
	})
	.register({
		flowType: flowTypeContract.Contract.flowType,
		eventType: flowTypeContract.Contract.eventTypes.updated,
		schema: flowTypeContract.Contract.schemas.updated,
	})
	.register({
		flowType: flowTypeContract.Contract.flowType,
		eventType: flowTypeContract.Contract.eventTypes.deleted,
		schema: flowTypeContract.Contract.schemas.deleted,
	})
	// Register event type events
	.register({
		flowType: eventTypeContract.Contract.flowType,
		eventType: eventTypeContract.Contract.eventTypes.created,
		schema: eventTypeContract.Contract.schemas.created,
	})
	.register({
		flowType: eventTypeContract.Contract.flowType,
		eventType: eventTypeContract.Contract.eventTypes.updated,
		schema: eventTypeContract.Contract.schemas.updated,
	})
	.register({
		flowType: eventTypeContract.Contract.flowType,
		eventType: eventTypeContract.Contract.eventTypes.deleted,
		schema: eventTypeContract.Contract.schemas.deleted,
	})

// Register handlers
pathways.handle(`${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.created}`, async ({ payload, eventId }) => {
	await handleDataCoreCreated(pathways, payload, eventId)
})

pathways.handle(`${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.updated}`, async ({ payload, eventId }) => {
	await handleDataCoreUpdated(pathways, payload, eventId)
})

pathways.handle(`${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.deleted}`, async ({ payload, eventId }) => {
	await handleDataCoreDeleted(pathways, payload, eventId)
})

pathways.handle(`${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.created}`, async ({ payload, eventId }) => {
	await handleFlowTypeCreated(pathways, payload, eventId)
})

pathways.handle(`${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.updated}`, async ({ payload, eventId }) => {
	await handleFlowTypeUpdated(pathways, payload, eventId)
})

pathways.handle(`${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.deleted}`, async ({ payload, eventId }) => {
	await handleFlowTypeDeleted(pathways, payload, eventId)
})

pathways.handle(`${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.created}`, async ({ payload, eventId }) => {
	await handleEventTypeCreated(pathways, payload, eventId)
})

pathways.handle(`${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.updated}`, async ({ payload, eventId }) => {
	await handleEventTypeUpdated(pathways, payload, eventId)
})

pathways.handle(`${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.deleted}`, async ({ payload, eventId }) => {
	await handleEventTypeDeleted(pathways, payload, eventId)
})
