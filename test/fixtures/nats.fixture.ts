// NATS client fixture - connects to real NATS server (via docker-compose)
import { connect, type NatsConnection, type Subscription, type MsgHdrs } from "nats"

export type NatsMessage = {
	topic: string
	data: unknown
	headers?: MsgHdrs
}

export class NatsFixture {
	private connection?: NatsConnection
	private subscriptions: Subscription[] = []

	async connect(url: string): Promise<void> {
		if (this.connection) {
			return
		}
		this.connection = await connect({ servers: url })
	}

	async disconnect(): Promise<void> {
		for (const sub of this.subscriptions) {
			await sub.drain()
		}
		this.subscriptions = []
		if (this.connection) {
			await this.connection.close()
			this.connection = undefined
		}
	}

	// Subscribe to topic and return a collector function
	subscribe(topic: string): () => Promise<NatsMessage[]> {
		if (!this.connection) {
			throw new Error("NATS connection not established. Call connect() first.")
		}

		const messages: NatsMessage[] = []
		const subscription = this.connection.subscribe(topic)
		this.subscriptions.push(subscription)

		// Set up message handler
		;(async () => {
			for await (const msg of subscription) {
				try {
					const data = JSON.parse(new TextDecoder().decode(msg.data))
					messages.push({
						topic: msg.subject,
						data,
						headers: msg.headers,
					})
				} catch (_error) {
					// If JSON parsing fails, store raw data
					messages.push({
						topic: msg.subject,
						data: new TextDecoder().decode(msg.data),
						headers: msg.headers,
					})
				}
			}
		})()

		// Return a function that collects messages after a delay
		return async (): Promise<NatsMessage[]> => {
			await new Promise((resolve) => setTimeout(resolve, 200))
			return [...messages]
		}
	}

	// Publish message (for test setup)
	async publish(topic: string, data: unknown): Promise<void> {
		if (!this.connection) {
			throw new Error("NATS connection not established. Call connect() first.")
		}
		const encoder = new TextEncoder()
		await this.connection.publish(topic, encoder.encode(JSON.stringify(data)))
	}
}
