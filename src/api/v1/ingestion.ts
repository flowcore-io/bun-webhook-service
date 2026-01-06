import { AuthType, HonoApiRouter, AppExceptionNotFound, AppExceptionBadRequest } from "@flowcore/hono-api"
import type { PathwaysBuilder } from "@flowcore/pathways"
import { TimeUuid } from "@flowcore/time-uuid"
import { z } from "zod"
import { validationService } from "@/services/validation.service"
import { ingestionAdapterService } from "@/services/ingestion-adapter.service"
import {
	HEADER_EVENT_TIME,
	HEADER_VALID_TIME,
	HEADER_METADATA_JSON,
	HEADER_EVENT_TIME_KEY,
	HEADER_VALID_TIME_KEY,
} from "@/constants/ingestion.constants"

export const ingestionRouter = new HonoApiRouter<PathwaysBuilder<any, any> | undefined>()

// Single event ingestion route
ingestionRouter.post("/event/:tenant/:dataCore/:flowType/:eventType", {
	tags: ["ingestion"],
	summary: "Ingest a single Flowcore event",
	description: "Ingest a single event into Flowcore. The event payload is sent as JSON in the request body. " +
		"You can override event time and valid time using headers, and add metadata via the metadata header. " +
		"Supports gzip and deflate compression for larger payloads.",
	auth: {
		type: [AuthType.Bearer, AuthType.ApiKey],
		optional: false,
	},
	input: {
		params: z.object({
			tenant: z.string().describe("The tenant identifier for the event"),
			dataCore: z.string().describe("The data core identifier where the event will be stored"),
			flowType: z.string().describe("The flow type identifier for the event"),
			eventType: z.string().describe("The event type identifier for the event"),
		}),
		headers: z.object({
			[HEADER_EVENT_TIME]: z.string().datetime().optional().describe(
				"ISO 8601 timestamp to override the event time. Defaults to ingestion time. " +
				"Affects when the event is stored and available for querying. " +
				"If specified at a time older than the maximum retention period, it will be available after an hour from cold storage."
			),
			[HEADER_VALID_TIME]: z.string().datetime().optional().describe(
				"ISO 8601 timestamp to override the valid time. Defaults to the event time. " +
				"Represents the time the event is valid from in Flowcore's bi-temporal storage."
			),
			[HEADER_METADATA_JSON]: z.string().optional().describe(
				"Base64-encoded stringified JSON object containing metadata for the event. " +
				"Supports options like 'ttl-on/stored-event' (max 7 days), 'do-not-archive-on/stored-event' for ephemeral events, " +
				"and other custom metadata fields."
			),
		}),
		body: z.any().describe(
			"The event payload as JSON. Maximum size is 64KB. " +
			"For larger payloads, consider using multipart file events or splitting into multiple events."
		),
	},
	output: z.object({
		received: z.boolean().describe("Indicates whether the event was successfully received"),
		eventType: z.string().describe("The event type identifier that was used"),
		flowType: z.string().describe("The flow type identifier that was used"),
		eventId: z.string().describe("The unique identifier assigned to the ingested event"),
	}),
	handler: async ({ params, body, headers }) => {
		// Validate resource existence
		const validation = await validationService.validate(
			params.tenant,
			params.dataCore,
			params.flowType,
			params.eventType,
		)

		if (!validation) {
			throw new AppExceptionNotFound("EventType", "name", `${params.tenant}/${params.dataCore}/${params.flowType}/${params.eventType}`)
		}

		// Parse metadata from base64 JSON header
		let metadata: Record<string, unknown> | undefined
		if (headers?.[HEADER_METADATA_JSON]) {
			try {
				const decoded = Buffer.from(headers[HEADER_METADATA_JSON], "base64").toString("utf-8")
				metadata = JSON.parse(decoded) as Record<string, unknown>
			} catch (error) {
				throw new AppExceptionBadRequest(undefined, undefined, "Invalid metadata header: must be valid base64-encoded JSON")
			}
		}

		// Publish to NATS
		const eventId = TimeUuid.now().toString()
		const publishedEventId = await ingestionAdapterService.publishEvent({
			eventId,
			tenant: params.tenant,
			dataCoreId: validation.dataCoreId,
			flowTypeId: validation.flowTypeId,
			eventTypeId: validation.eventTypeId,
			flowTypeName: params.flowType,
			eventTypeName: params.eventType,
			payload: body,
			eventTime: headers?.[HEADER_EVENT_TIME],
			validTime: headers?.[HEADER_VALID_TIME],
			metadata,
		})

		return {
			received: true,
			eventType: params.eventType,
			flowType: params.flowType,
			eventId: publishedEventId,
		}
	},
})

// Batch event ingestion route
ingestionRouter.post("/events/:tenant/:dataCore/:flowType/:eventType", {
	tags: ["ingestion"],
	summary: "Ingest a batch of Flowcore events",
	description: "Ingest multiple events in a single request. The request body should be an array of event payloads. " +
		"You can specify field names in the payload to use as event time and valid time using the respective key headers. " +
		"All events in the batch will share the same metadata if provided. " +
		"Supports gzip and deflate compression for larger payloads.",
	auth: {
		type: [AuthType.Bearer, AuthType.ApiKey],
		optional: false,
	},
	input: {
		params: z.object({
			tenant: z.string().describe("The tenant identifier for the events"),
			dataCore: z.string().describe("The data core identifier where the events will be stored"),
			flowType: z.string().describe("The flow type identifier for the events"),
			eventType: z.string().describe("The event type identifier for the events"),
		}),
		headers: z.object({
			[HEADER_EVENT_TIME_KEY]: z.string().optional().describe(
				"Field name in the event payload to use as the event time. " +
				"The field value should be an ISO 8601 timestamp. " +
				"Useful for batch ingestion when each event has its own timestamp field."
			),
			[HEADER_VALID_TIME_KEY]: z.string().optional().describe(
				"Field name in the event payload to use as the valid time. " +
				"The field value should be an ISO 8601 timestamp. " +
				"Useful for batch ingestion when each event has its own valid time field."
			),
			[HEADER_METADATA_JSON]: z.string().optional().describe(
				"Base64-encoded stringified JSON object containing metadata for all events in the batch. " +
				"Supports options like 'ttl-on/stored-event' (max 7 days), 'do-not-archive-on/stored-event' for ephemeral events, " +
				"and other custom metadata fields."
			),
		}),
		body: z.array(z.any()).describe(
			"Array of event payloads as JSON objects. Each event can be up to 64KB. " +
			"For larger payloads, consider using multipart file events or splitting into multiple events."
		),
	},
	output: z.object({
		received: z.boolean().describe("Indicates whether the batch of events was successfully received"),
		eventIds: z.array(z.string()).describe("Array of unique identifiers assigned to each ingested event in the batch"),
	}),
	handler: async ({ params, body, headers }) => {
		// Validate resource existence
		const validation = await validationService.validate(
			params.tenant,
			params.dataCore,
			params.flowType,
			params.eventType,
		)

		if (!validation) {
			throw new AppExceptionNotFound("EventType", "name", `${params.tenant}/${params.dataCore}/${params.flowType}/${params.eventType}`)
		}

		// Parse metadata from base64 JSON header
		let metadata: Record<string, unknown> | undefined
		if (headers?.[HEADER_METADATA_JSON]) {
			try {
				const decoded = Buffer.from(headers[HEADER_METADATA_JSON], "base64").toString("utf-8")
				metadata = JSON.parse(decoded) as Record<string, unknown>
			} catch (error) {
				throw new AppExceptionBadRequest(undefined, undefined, "Invalid metadata header: must be valid base64-encoded JSON")
			}
		}

		// Extract eventTime and validTime from payload using keys (if provided)
		const eventTimeKey = headers?.[HEADER_EVENT_TIME_KEY]
		const validTimeKey = headers?.[HEADER_VALID_TIME_KEY]

		// Publish all events to NATS
		const events = body.map((payload) => {
			// Extract eventTime/validTime from payload if keys are provided
			const eventTime = eventTimeKey && typeof payload === "object" && payload !== null
				? (payload as Record<string, unknown>)[eventTimeKey] as string | undefined
				: undefined
			const validTime = validTimeKey && typeof payload === "object" && payload !== null
				? (payload as Record<string, unknown>)[validTimeKey] as string | undefined
				: undefined

			return {
				eventId: TimeUuid.now().toString(),
				tenant: params.tenant,
				dataCoreId: validation.dataCoreId,
				flowTypeId: validation.flowTypeId,
				eventTypeId: validation.eventTypeId,
				flowTypeName: params.flowType,
				eventTypeName: params.eventType,
				payload,
				eventTime,
				validTime,
				metadata,
			}
		})

		const eventIds = await ingestionAdapterService.publishEvents(events)

		return {
			received: true,
			eventIds,
		}
	},
})
