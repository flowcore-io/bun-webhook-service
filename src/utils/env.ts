/**
 * Environment detection utilities
 */

/**
 * Determines if the current environment is a test environment
 * Checks multiple indicators to reliably detect test mode
 */
export function isTestEnvironment(): boolean {
	return (
		process.env.NODE_ENV === "test" ||
		process.env.POSTGRES_CONNECTION_STRING?.includes("54321") ||
		false
	)
}

/**
 * Gets the Redis port for the current environment
 * Test environment uses 16379, dev/prod uses 6379
 */
export function getRedisPort(): number {
	return isTestEnvironment() ? 16379 : 6379
}

/**
 * Gets the NATS port for the current environment
 * Test environment uses 14222, dev/prod uses 4222
 */
export function getNatsPort(): number {
	return isTestEnvironment() ? 14222 : 4222
}
