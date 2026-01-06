import {
  METADATA_EVENT_TIME,
  METADATA_INGESTED_AT,
  METADATA_PRODUCER,
  METADATA_VALID_TIME_ON_STORED_EVENT,
  NATS_HEADER_TENANT_ID,
  PRODUCER_NAME,
  TOPIC_GUARANTEED_INGESTION_CHANNEL,
} from "@/constants/ingestion.constants"
import env from "@/env"
import { natsService } from "./nats.service"

export interface IngestionEvent {
	eventId: string
	tenant: string
	dataCoreId: string
	flowTypeId: string
	eventTypeId: string
	flowTypeName: string
	eventTypeName: string
	payload: unknown
	metadata?: Record<string, unknown>
	eventTime?: string
	validTime?: string
	producer?: string
}

export class IngestionAdapterService {
	private readonly topic: string
	private readonly producerName: string

	constructor() {
		this.topic = env.NATS_TOPIC || TOPIC_GUARANTEED_INGESTION_CHANNEL
		this.producerName = PRODUCER_NAME
	}

	async publishEvent(event: IngestionEvent): Promise<string> {
		const now = new Date().toISOString()

		// Convert metadata to Record<string, string> (all values must be strings)
		const metadata: Record<string, string> = {}
		if (event.metadata) {
			for (const [key, value] of Object.entries(event.metadata)) {
				metadata[key] = typeof value === "string" ? value : JSON.stringify(value)
			}
		}
		// Add well-known metadata fields
		metadata[METADATA_PRODUCER] = event.producer || this.producerName
		metadata[METADATA_INGESTED_AT] = now
		if (event.eventTime) {
			metadata[METADATA_EVENT_TIME] = event.eventTime
		}
		if (event.validTime) {
			metadata[METADATA_VALID_TIME_ON_STORED_EVENT] = event.validTime
		}

		// Format message according to ChannelEventSchemaWrapper expected by service-ingestion
		// See: /Users/julius/git/flowcore/service-ingestion/src/services/ingestion.service.ts
		const natsMessage = {
			pattern: this.topic,
			id: event.eventId,
			data: {
				eventId: event.eventId,
				dataCore: event.dataCoreId, // UUID string
				aggregator: event.flowTypeName, // flowType is called "aggregator" in service-ingestion
				eventType: event.eventTypeName,
				metadata,
				serializedPayload: JSON.stringify(event.payload), // Payload must be serialized as string
			},
		}

		// Tenant ID must be in header: X-Tenant-Id
		const headers = {
			[NATS_HEADER_TENANT_ID]: event.tenant,
		}

		// publish() queues message and flush() ensures it's sent and acknowledged
		await natsService.publish(this.topic, natsMessage, headers)
		// Return the event ID for acknowledgment
		return event.eventId
	}

	async publishEvents(events: IngestionEvent[]): Promise<string[]> {
		// For high throughput: batch publish all messages, then flush once
		// This is more efficient than flushing after each message
		const now = new Date().toISOString()
		
		// All events in a batch should have the same tenant (from the same API call)
		const tenant = events[0]?.tenant
		if (!tenant) {
			throw new Error("Events must have a tenant")
		}
		
		// Prepare all messages according to ChannelEventSchemaWrapper
		const messages = events.map((event) => {
			// Convert metadata to Record<string, string> (all values must be strings)
			const metadata: Record<string, string> = {}
			if (event.metadata) {
				for (const [key, value] of Object.entries(event.metadata)) {
					metadata[key] = typeof value === "string" ? value : JSON.stringify(value)
				}
			}
			// Add well-known metadata fields
			metadata[METADATA_PRODUCER] = event.producer || this.producerName
			metadata[METADATA_INGESTED_AT] = now
			if (event.eventTime) {
				metadata[METADATA_EVENT_TIME] = event.eventTime
			}
			if (event.validTime) {
				metadata[METADATA_VALID_TIME_ON_STORED_EVENT] = event.validTime
			}

			return {
				pattern: this.topic,
				id: event.eventId,
				data: {
					eventId: event.eventId,
					dataCore: event.dataCoreId, // UUID string
					aggregator: event.flowTypeName, // flowType is called "aggregator" in service-ingestion
					eventType: event.eventTypeName,
					metadata,
					serializedPayload: JSON.stringify(event.payload), // Payload must be serialized as string
				},
			}
		})

		// Tenant ID must be in header: X-Tenant-Id
		const headers = {
			[NATS_HEADER_TENANT_ID]: tenant,
		}

		// Batch publish all messages (queues them)
		await natsService.publishBatch(this.topic, messages, headers)
		
		// Return all event IDs
		return events.map((event) => event.eventId)
	}
}

export const ingestionAdapterService = new IngestionAdapterService()
