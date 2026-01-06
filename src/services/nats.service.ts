import env from "@/env"
import { connect, headers, type NatsConnection } from "nats"

class NatsService {
	private connection?: NatsConnection
	private isConnected = false

	async connect(): Promise<void> {
		if (this.connection && this.isConnected) {
			return
		}

		const url = env.NATS_URL || "nats://localhost:4222"
		this.connection = await connect({ servers: url })
		this.isConnected = true
	}

	async disconnect(): Promise<void> {
		if (this.connection) {
			await this.connection.close()
			this.connection = undefined
			this.isConnected = false
		}
	}

	private async ensureConnected(): Promise<void> {
		if (!this.connection || !this.isConnected) {
			// Try to connect if not connected
			try {
				await this.connect()
			} catch (error) {
				// If connection fails, throw error
				throw new Error("NATS connection not established and connection attempt failed.")
			}
		}
	}

	async publish(topic: string, data: unknown, msgHeaders?: Record<string, string>): Promise<void> {
		await this.ensureConnected()
		if (!this.connection) {
			throw new Error("NATS connection not available")
		}
		const encoder = new TextEncoder()
		// publish() returns void - message is queued for delivery
		// For guaranteed delivery acknowledgment, use flush() or JetStream
		const natsHeaders = msgHeaders ? headers() : undefined
		if (natsHeaders && msgHeaders) {
			for (const [key, value] of Object.entries(msgHeaders)) {
				natsHeaders.set(key, value)
			}
		}
		this.connection.publish(topic, encoder.encode(JSON.stringify(data)), { headers: natsHeaders })
		// Flush to ensure message is sent and get acknowledgment
		await this.connection.flush()
	}

	async publishBatch(topic: string, dataArray: unknown[], msgHeaders?: Record<string, string>): Promise<void> {
		await this.ensureConnected()
		if (!this.connection) {
			throw new Error("NATS connection not available")
		}
		const encoder = new TextEncoder()
		const natsHeaders = msgHeaders ? headers() : undefined
		if (natsHeaders && msgHeaders) {
			for (const [key, value] of Object.entries(msgHeaders)) {
				natsHeaders.set(key, value)
			}
		}
		// Publish all messages in batch (queues them efficiently)
		for (const data of dataArray) {
			this.connection.publish(topic, encoder.encode(JSON.stringify(data)), { headers: natsHeaders })
		}
		// Single flush after all messages are queued - more efficient for high throughput
		await this.connection.flush()
	}
}

export const natsService = new NatsService()
