/**
 * Constants for ingestion service
 * Matches constants from service-ingestion-webhook-service for compatibility
 */

// NATS Topic Constants
export const TOPIC_GUARANTEED_INGESTION_CHANNEL = "guaranteed-ingestion-channel.1"

// HTTP Header Constants (for incoming requests)
export const HEADER_EVENT_TIME = "x-flowcore-event-time"
export const HEADER_VALID_TIME = "x-flowcore-valid-time"
export const HEADER_METADATA_JSON = "x-flowcore-metadata-json"
export const HEADER_EVENT_TIME_KEY = "x-flowcore-event-time-key"
export const HEADER_VALID_TIME_KEY = "x-flowcore-valid-time-key"

// NATS Header Constants (for outgoing messages)
export const NATS_HEADER_TENANT_ID = "X-Tenant-Id"

// Well-Known Metadata Keys
export const METADATA_PRODUCER = "producer"
export const METADATA_INGESTED_AT = "ingested-at"
export const METADATA_EVENT_TIME = "event-time"
export const METADATA_VALID_TIME_ON_STORED_EVENT = "valid-time-on/stored-event"
export const METADATA_TTL_ON_STORED_EVENT = "ttl-on/stored-event"
export const METADATA_NOTIFY_ON_STORED_EVENT = "notify-on/stored-event"
export const METADATA_DO_NOT_ARCHIVE_ON_STORED_EVENT = "do-not-archive-on/stored-event"
export const METADATA_PRODUCER_NAME = "producer/name"
export const METADATA_IS_DERIVED_EVENT = "is-derived-event/stored-event"
export const METADATA_NOTIFY_RECORDER = "notify/recorder"

// Producer name
export const PRODUCER_NAME = "bun-webhook-service"
