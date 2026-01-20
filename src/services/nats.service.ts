import env from "@/env"
import { getNatsPort } from "@/utils/env"
import { connect, headers, type MsgHdrs, type NatsConnection } from "nats"

class NatsService {
	private connection?: NatsConnection
	private isConnected = false

	/**
	 * Builds NATS headers from a record of string key-value pairs
	 */
	private buildHeaders(msgHeaders?: Record<string, string>): MsgHdrs | undefined {
		if (!msgHeaders) return undefined

		const natsHeaders = headers()
		for (const [key, value] of Object.entries(msgHeaders)) {
			natsHeaders.set(key, value)
		}
		return natsHeaders
	}

	async connect(): Promise<void> {
		if (this.connection && this.isConnected) {
			// Verify connection is still alive
			try {
				if (await this.connection.closed()) {
					this.isConnected = false
					this.connection = undefined
				} else {
					return
				}
			} catch {
				this.isConnected = false
				this.connection = undefined
			}
		}

		// Use process.env directly to ensure test environment variables are picked up
		const defaultPort = getNatsPort()
		const url = process.env.NATS_URL || env.NATS_URL || `nats://localhost:${defaultPort}`
		try {
			this.connection = await connect({ 
				servers: url,
				reconnect: true,
				maxReconnectAttempts: 10,
				reconnectTimeWait: 2000,
				timeout: 10000, // 10 second connection timeout
			})
			
			// Verify connection is actually working by flushing
			await this.connection.flush()
			
			// Set up connection event handlers
			;(async () => {
				for await (const status of this.connection!.status()) {
					if (status.type === "disconnect" || status.type === "error") {
						this.isConnected = false
					} else if (status.type === "reconnect") {
						this.isConnected = true
					}
				}
			})().catch(() => {
				// Ignore errors in status monitoring
			})
			
			this.isConnected = true
		} catch (error) {
			this.isConnected = false
			this.connection = undefined
			const errorMessage = error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to connect to NATS at ${url}: ${errorMessage}`)
		}
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
			// Try to connect if not connected with retry (fixed delay, no exponential backoff)
			const maxRetries = 5
			const delay = 500 // Fixed 500ms delay between retries
			
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					await this.connect()
					return // Success
				} catch (error) {
					if (attempt === maxRetries - 1) {
						// If connection fails after retries, throw error with more context
						const errorMessage = error instanceof Error ? error.message : String(error)
						throw new Error(`NATS connection not established and connection attempt failed: ${errorMessage}`)
					}
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}
	}

	async publish(topic: string, data: unknown, msgHeaders?: Record<string, string>): Promise<void> {
		await this.ensureConnected()
		if (!this.connection) {
			throw new Error("NATS connection not available")
		}

		const encoder = new TextEncoder()
		const natsHeaders = this.buildHeaders(msgHeaders)
		
		// publish() returns void - message is queued for delivery
		// For guaranteed delivery acknowledgment, use flush() or JetStream
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
		const natsHeaders = this.buildHeaders(msgHeaders)
		
		// Publish all messages in batch (queues them efficiently)
		for (const data of dataArray) {
			this.connection.publish(topic, encoder.encode(JSON.stringify(data)), { headers: natsHeaders })
		}
		
		// Single flush after all messages are queued - more efficient for high throughput
		await this.connection.flush()
	}
}

export const natsService = new NatsService()
