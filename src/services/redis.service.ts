import env from "@/env"
import Redis from "ioredis"

class RedisService {
	private client?: Redis
	private isConnected = false

	async connect(): Promise<void> {
		if (this.client && this.isConnected) {
			return
		}

		const sentinelHosts = env.REDIS_SENTINEL_HOSTS
		const masterName = env.REDIS_SENTINEL_MASTER_NAME || "mymaster"
		const password = env.REDIS_PASSWORD

		if (sentinelHosts) {
			// Use Redis Sentinel
			const sentinels = sentinelHosts.split(",").map((host) => {
				const [hostname, port] = host.trim().split(":")
				return {
					host: hostname || "localhost",
					port: Number(port) || 26379,
				}
			})

			this.client = new Redis({
				sentinels,
				name: masterName,
				password,
				retryStrategy: (times) => {
					const delay = Math.min(times * 50, 2000)
					return delay
				},
			})
		} else {
			// Direct Redis connection (for testing/development)
			this.client = new Redis({
				host: "localhost",
				port: 6379,
				password,
				retryStrategy: (times) => {
					const delay = Math.min(times * 50, 2000)
					return delay
				},
			})
		}

		// Wait for connection
		await this.client.ping()
		this.isConnected = true
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.quit()
			this.client = undefined
			this.isConnected = false
		}
	}

	private async ensureConnected(): Promise<void> {
		if (!this.client || !this.isConnected) {
			// Try to connect if not connected
			try {
				await this.connect()
			} catch (error) {
				// If connection fails, throw error
				throw new Error("Redis client not connected and connection attempt failed.")
			}
		}
	}

	async get(key: string): Promise<string | null> {
		await this.ensureConnected()
		return this.client!.get(key)
	}

	async set(key: string, value: string, ttl?: number): Promise<void> {
		await this.ensureConnected()
		const ttlSeconds = ttl ?? env.REDIS_CACHE_TTL
		if (ttlSeconds > 0) {
			await this.client!.setex(key, ttlSeconds, value)
		} else {
			await this.client!.set(key, value)
		}
	}

	async del(key: string): Promise<void> {
		await this.ensureConnected()
		await this.client!.del(key)
	}

	async delPattern(pattern: string): Promise<void> {
		await this.ensureConnected()
		const keys = await this.client!.keys(pattern)
		if (keys.length > 0) {
			await this.client!.del(...keys)
		}
	}

	// Cache key helpers
	private getDataCoreKey(tenant: string, dataCoreName: string): string {
		return `data_core:${tenant}:${dataCoreName}`
	}

	private getFlowTypeKey(dataCoreId: string, flowTypeName: string): string {
		return `flow_type:${dataCoreId}:${flowTypeName}`
	}

	private getEventTypeKey(flowTypeId: string, eventTypeName: string): string {
		return `event_type:${flowTypeId}:${eventTypeName}`
	}

	// Invalidation methods
	async invalidateDataCore(tenant: string, dataCoreName: string): Promise<void> {
		const key = this.getDataCoreKey(tenant, dataCoreName)
		await this.del(key)
		// Also invalidate related flow types and event types
		await this.delPattern(`flow_type:*:${dataCoreName}*`)
		await this.delPattern(`event_type:*:${dataCoreName}*`)
	}

	async invalidateFlowType(dataCoreId: string, flowTypeName: string): Promise<void> {
		const key = this.getFlowTypeKey(dataCoreId, flowTypeName)
		await this.del(key)
		// Also invalidate related event types
		await this.delPattern(`event_type:${dataCoreId}:${flowTypeName}*`)
	}

	async invalidateEventType(flowTypeId: string, eventTypeName: string): Promise<void> {
		const key = this.getEventTypeKey(flowTypeId, eventTypeName)
		await this.del(key)
	}
}

export const redisService = new RedisService()
