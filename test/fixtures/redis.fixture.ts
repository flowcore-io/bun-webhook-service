// Redis client fixture - connects to real Redis Sentinel (via docker-compose)
import Redis from "ioredis"

export class RedisFixture {
	private client?: Redis

	async connect(sentinelHosts: string[], masterName: string, password?: string): Promise<void> {
		if (this.client) {
			return
		}

		// Use Redis Sentinel if hosts are provided
		if (sentinelHosts && sentinelHosts.length > 0) {
			const sentinels = sentinelHosts.map((host) => {
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
				maxRetriesPerRequest: 3,
				enableReadyCheck: true,
				lazyConnect: false,
			})
		} else {
			// Fallback to direct Redis connection
			this.client = new Redis({
				host: "localhost",
				port: 6379,
				password,
				maxRetriesPerRequest: 3,
				enableReadyCheck: true,
				lazyConnect: false,
			})
		}

		// Wait for connection with retries
		let retries = 30
		while (retries > 0) {
			try {
				await this.client.ping()
				return
			} catch (error) {
				if (retries === 1) {
					throw error
				}
				await Bun.sleep(500)
				retries--
			}
		}
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
			throw new Error("Redis client not connected. Call connect() first.")
		}
		await this.client.flushall()
	}
}
