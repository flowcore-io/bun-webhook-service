import { db } from "@/database"
import { dataCores, flowTypes, eventTypes } from "@/database/tables"
import { eq, and } from "drizzle-orm"
import env from "@/env"
import { redisService } from "./redis.service"

type ValidationResult = {
	dataCoreId: string
	flowTypeId: string
	eventTypeId: string
}

// Bun in-memory promise cache
const promiseCache = new Map<string, Promise<ValidationResult | null>>()
const cacheTimestamps = new Map<string, number>()

// TTL for Bun promise cache (in milliseconds)
const BUN_CACHE_TTL = (env.BUN_PROMISE_CACHE_TTL || 30) * 1000

function getCacheKey(tenant: string, dataCoreName: string, flowTypeName: string, eventTypeName: string): string {
	return `${tenant}:${dataCoreName}:${flowTypeName}:${eventTypeName}`
}

function cleanupExpiredCache(): void {
	const now = Date.now()
	for (const [key, timestamp] of cacheTimestamps.entries()) {
		if (now - timestamp > BUN_CACHE_TTL) {
			promiseCache.delete(key)
			cacheTimestamps.delete(key)
		}
	}
}

// Run cleanup every 10 seconds
setInterval(cleanupExpiredCache, 10000)

export class ValidationService {
	async validate(
		tenant: string,
		dataCoreName: string,
		flowTypeName: string,
		eventTypeName: string,
	): Promise<ValidationResult | null> {
		const cacheKey = getCacheKey(tenant, dataCoreName, flowTypeName, eventTypeName)

		// Check Bun promise cache first
		const cachedPromise = promiseCache.get(cacheKey)
		if (cachedPromise) {
			const timestamp = cacheTimestamps.get(cacheKey)
			if (timestamp && Date.now() - timestamp < BUN_CACHE_TTL) {
				return cachedPromise
			}
			// Cache expired, remove it
			promiseCache.delete(cacheKey)
			cacheTimestamps.delete(cacheKey)
		}

		// Create new validation promise
		const validationPromise = this.performValidation(tenant, dataCoreName, flowTypeName, eventTypeName)

		// Cache the promise (not the result) so concurrent requests share the same validation
		promiseCache.set(cacheKey, validationPromise)
		cacheTimestamps.set(cacheKey, Date.now())

		try {
			const result = await validationPromise
			// Don't cache failed validations
			if (!result) {
				promiseCache.delete(cacheKey)
				cacheTimestamps.delete(cacheKey)
			}
			return result
		} catch (error) {
			// On error, invalidate cache
			promiseCache.delete(cacheKey)
			cacheTimestamps.delete(cacheKey)
			throw error
		}
	}

	private async performValidation(
		tenant: string,
		dataCoreName: string,
		flowTypeName: string,
		eventTypeName: string,
	): Promise<ValidationResult | null> {
		// Check Redis cache
		const redisKey = `validation:${tenant}:${dataCoreName}:${flowTypeName}:${eventTypeName}`
		try {
			const cached = await redisService.get(redisKey)
			if (cached) {
				return JSON.parse(cached) as ValidationResult
			}
		} catch (error) {
			// Redis error - continue to PostgreSQL
			console.warn("Redis cache read failed, falling back to PostgreSQL", error)
		}

		// Query PostgreSQL
		const dataCore = await db
			.select()
			.from(dataCores)
			.where(and(eq(dataCores.tenant, tenant), eq(dataCores.name, dataCoreName)))
			.limit(1)

		if (!dataCore[0]) {
			return null
		}

		const flowType = await db
			.select()
			.from(flowTypes)
			.where(and(eq(flowTypes.dataCoreId, dataCore[0].id), eq(flowTypes.name, flowTypeName)))
			.limit(1)

		if (!flowType[0]) {
			return null
		}

		const eventType = await db
			.select()
			.from(eventTypes)
			.where(and(eq(eventTypes.flowTypeId, flowType[0].id), eq(eventTypes.name, eventTypeName)))
			.limit(1)

		if (!eventType[0]) {
			return null
		}

		const result: ValidationResult = {
			dataCoreId: dataCore[0].id,
			flowTypeId: flowType[0].id,
			eventTypeId: eventType[0].id,
		}

		// Cache in Redis
		try {
			await redisService.set(redisKey, JSON.stringify(result))
		} catch (error) {
			// Redis error - continue without caching
			console.warn("Redis cache write failed", error)
		}

		return result
	}

	// Invalidate cache for a specific event type
	invalidateCache(tenant: string, dataCoreName: string, flowTypeName: string, eventTypeName: string): void {
		const cacheKey = getCacheKey(tenant, dataCoreName, flowTypeName, eventTypeName)
		promiseCache.delete(cacheKey)
		cacheTimestamps.delete(cacheKey)
	}
}

export const validationService = new ValidationService()
