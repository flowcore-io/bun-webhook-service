// Redis client fixture - connects to real Redis Sentinel (via docker-compose)
import { getRedisPort } from "@/utils/env"
import Redis from "ioredis"

export class RedisFixture {
	private client?: Redis

	async connect(sentinelHosts: string[], masterName: string, password?: string): Promise<void> {
		if (this.client) {
			return
		}

		// For tests, use direct Redis connection instead of Sentinel
		// Tests don't need high availability, and direct connection avoids Docker networking issues
		const redisPort = getRedisPort()
		
		this.client = new Redis({
			host: "localhost",
			port: redisPort,
			password,
			retryStrategy: (times) => {
				// Stop retrying after 10 attempts
				if (times > 10) {
					return null // Stop retrying
				}
				const delay = Math.min(times * 50, 2000)
				return delay
			},
			maxRetriesPerRequest: 3,
			enableReadyCheck: true,
			lazyConnect: true,
		})

		// Wait for connection
		await this.client.ping()
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.quit()
			this.client = undefined
		}
	}

	// Cache operations for verification
	async get(key: string): Promise<string | null> {
		if (!this.client) {
			throw new Error("Redis client not connected. Call connect() first.")
		}
		return this.client.get(key)
	}

	async set(key: string, value: string, ttl?: number): Promise<void> {
		if (!this.client) {
			throw new Error("Redis client not connected. Call connect() first.")
		}
		if (ttl) {
			await this.client.setex(key, ttl, value)
		} else {
			await this.client.set(key, value)
		}
	}

	async del(key: string): Promise<void> {
		if (!this.client) {
			throw new Error("Redis client not connected. Call connect() first.")
		}
		await this.client.del(key)
	}

	async clear(): Promise<void> {
		// For test cleanup - flush all keys
		if (!this.client) {
			// Silently skip if not connected (services might not be available)
			return
		}
		try {
			await this.client.flushall()
		} catch (error) {
			// Silently ignore errors during cleanup (Redis might be reconnecting)
			console.warn("Redis clear failed (non-critical):", error instanceof Error ? error.message : String(error))
		}
	}
}
