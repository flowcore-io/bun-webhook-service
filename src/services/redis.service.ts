import env from "@/env"
import Redis from "ioredis"
import { getRedisPort, isTestEnvironment } from "@/utils/env"

// Retry strategy constants
const REDIS_RETRY_STRATEGY = (times: number): number | null => {
	// Stop retrying after 10 attempts (about 5 seconds total)
	if (times > 10) {
		return null // Stop retrying
	}
	return Math.min(times * 50, 2000)
}

const SENTINEL_RETRY_STRATEGY = (times: number): number | null => {
	// Stop retrying sentinel connections after 5 attempts
	if (times > 5) {
		return null // Stop retrying
	}
	return Math.min(times * 100, 2000)
}

/**
 * Builds a NAT map to translate internal Docker IPs to localhost
 * This is critical when connecting from host to Docker containers.
 * Sentinel returns internal Docker IPs (e.g., 192.168.107.4:6379),
 * but we need to connect via localhost with the mapped port.
 */
function buildDockerNatMap(redisPort: number): Record<string, { host: string; port: number }> {
	const natMap: Record<string, { host: string; port: number }> = {}
	
	// Map the specific IP we're seeing in test environment
	natMap["192.168.107.4:6379"] = { host: "localhost", port: redisPort }
	
	// Map common Docker network IP patterns
	// Docker networks typically use:
	// - 192.168.x.x (custom networks, especially 192.168.107.x for test)
	// - 172.17-31.x.x (Docker default and custom networks)
	const commonSubnets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210]
	
	for (let i = 1; i <= 255; i++) {
		// 192.168.107.x (test network we're seeing)
		natMap[`192.168.107.${i}:6379`] = { host: "localhost", port: redisPort }
		
		// Common 192.168.x.x subnets
		for (const subnet of commonSubnets) {
			natMap[`192.168.${subnet}.${i}:6379`] = { host: "localhost", port: redisPort }
		}
		
		// 172.17-31.x.x (Docker default and custom networks)
		for (let second = 17; second <= 31; second++) {
			for (const third of commonSubnets) {
				natMap[`172.${second}.${third}.${i}:6379`] = { host: "localhost", port: redisPort }
			}
		}
	}
	
	return natMap
}

class RedisService {
	private client?: Redis
	private isConnected = false

	/**
	 * Creates a Redis client using Sentinel configuration
	 */
	private createSentinelClient(
		sentinelHosts: string,
		masterName: string,
		password?: string,
	): Redis {
		const sentinels = sentinelHosts.split(",").map((host) => {
			const [hostname, port] = host.trim().split(":")
			return {
				host: hostname || "localhost",
				port: Number(port) || 26379,
			}
		})

		const redisPort = getRedisPort()
		const natMap = buildDockerNatMap(redisPort)

		return new Redis({
			sentinels,
			name: masterName,
			password,
			retryStrategy: REDIS_RETRY_STRATEGY,
			sentinelRetryStrategy: SENTINEL_RETRY_STRATEGY,
			maxRetriesPerRequest: 3,
			enableReadyCheck: true,
			lazyConnect: true,
			natMap,
			updateSentinels: false, // CRITICAL: Prevent ioredis from overwriting working localhost addresses with unreachable Docker IPs
			family: 4, // Force IPv4
		})
	}

	/**
	 * Creates a Redis client using direct connection
	 */
	private createDirectClient(password?: string): Redis {
		const redisPort = getRedisPort()

		return new Redis({
			host: "localhost",
			port: redisPort,
			password,
			retryStrategy: REDIS_RETRY_STRATEGY,
			maxRetriesPerRequest: 3,
			enableReadyCheck: true,
			lazyConnect: true,
		})
	}

	/**
	 * Sets up event handlers for the Redis client
	 */
	private setupEventHandlers(): void {
		if (!this.client) return

		this.client.on("error", (error) => {
			console.warn("Redis client error:", error.message)
			this.isConnected = false
		})

		this.client.on("close", () => {
			console.warn("Redis client connection closed")
			this.isConnected = false
		})

		this.client.on("reconnecting", () => {
			console.log("Redis client reconnecting...")
			this.isConnected = false
		})

		this.client.on("ready", () => {
			console.log("Redis client ready")
			this.isConnected = true
		})
	}

	/**
	 * Establishes the connection and verifies it's working
	 */
	private async establishConnection(): Promise<void> {
		if (!this.client) {
			throw new Error("Redis client not initialized")
		}

		// Connect explicitly (since we're using lazyConnect: true)
		await this.client.connect()

		// Wait for connection to be ready - ping with timeout
		await Promise.race([
			this.client.ping(),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("Redis connection timeout after 5s")), 5000),
			),
		])

		// Verify connection status
		if (this.client.status === "ready") {
			this.isConnected = true
			console.log("Redis client connected successfully")
		} else {
			throw new Error(`Redis client not ready, status: ${this.client.status}`)
		}
	}

	async connect(): Promise<void> {
		if (this.client && this.isConnected) {
			return
		}

		const sentinelHosts = env.REDIS_SENTINEL_HOSTS
		const masterName = env.REDIS_SENTINEL_MASTER_NAME || "mymaster"
		const password = env.REDIS_PASSWORD

		// Create client based on configuration
		if (sentinelHosts) {
			this.client = this.createSentinelClient(sentinelHosts, masterName, password)
		} else {
			this.client = this.createDirectClient(password)
		}

		// Set up event handlers
		this.setupEventHandlers()

		// Establish and verify connection
		try {
			await this.establishConnection()
		} catch (error) {
			this.isConnected = false
			if (error instanceof Error) {
				console.warn(`Redis connection failed: ${error.message}`)
			}
			throw error
		}
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
			// Try to connect if not connected with retry
			const maxRetries = 3
			const baseDelay = 500
			
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					await this.connect()
					return // Success
				} catch (error) {
					if (attempt === maxRetries - 1) {
						// If connection fails after retries, throw error
						throw new Error("Redis client not connected and connection attempt failed.")
					}
					const delay = baseDelay * (attempt + 1)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
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
