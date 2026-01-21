import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sql"

// Verify Redis Sentinel connection
async function verifyRedisConnection(): Promise<boolean> {
  try {
    const Redis = (await import("ioredis")).default
    const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS || "localhost:26380"
    const masterName = process.env.REDIS_SENTINEL_MASTER_NAME || "mymaster"
    
    const sentinels = sentinelHosts.split(",").map((host) => {
      const [hostname, port] = host.trim().split(":")
      return {
        host: hostname || "localhost",
        port: Number(port) || 26379,
      }
    })
    
    const client = new Redis({
      sentinels,
      name: masterName,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5000, // 5 second timeout
      retryStrategy: () => null, // Don't retry on failure
    })
    
    try {
      await client.connect()
      await client.ping()
      await client.quit()
      return true
    } catch (error) {
      // Clean up on error
      try {
        await client.quit()
      } catch {
        // Ignore cleanup errors
      }
      return false
    }
  } catch (error) {
    // Log error for debugging
    if (error instanceof Error) {
      console.warn(`Redis verification failed: ${error.message}`)
    }
    return false
  }
}

// Verify NATS connection
async function verifyNatsConnection(): Promise<boolean> {
  try {
    const { connect } = await import("nats")
    const url = process.env.NATS_URL || "nats://localhost:14222"
    const connection = await connect({ servers: url })
    await connection.close()
    return true
  } catch {
    return false
  }
}

// Verify PostgreSQL connection
// Create a fresh connection for verification instead of using the module-level db
// This avoids issues where the module-level connection was created before PostgreSQL was ready
async function verifyPostgresConnection(): Promise<boolean> {
  const connectionString = process.env.POSTGRES_CONNECTION_STRING || "postgresql://postgres:test@localhost:54321/bun_webhook_service_test"
  const isCI = process.env.CI === "true"
  
  // In CI, PostgreSQL might need more time to be fully ready after healthcheck passes
  // Use more retries and longer waits in CI
  const maxAttempts = isCI ? 30 : 5
  const waitTime = isCI ? 1000 : 500
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Create a fresh connection for verification
      const testClient = new Bun.SQL(connectionString)
      const testDb = drizzle({ client: testClient, schema: {} })
      await testDb.execute(sql`SELECT 1`)
      // Clean up the test connection
      await testClient.close()
      return true
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        // Last attempt failed
        return false
      }
      // Wait before retrying - longer in CI
      await Bun.sleep(waitTime)
    }
  }
  return false
}

export const servicesUp = async () => {
  console.log("➖ Starting services...")
  // In CI: clean environment, just start services normally
  // Local dev: user controls services manually
  // Check if services are already running to avoid duplicate starts
  try {
    const psResult = await $`docker compose ps --format json`.cwd("./test").quiet()
    const psText = await psResult.text()
    if (psText) {
      const containers = JSON.parse(`[${psText.split("\n").filter(Boolean).join(",")}]`)
      const runningContainers = containers.filter((c: { State: string }) => c.State === "running")
      if (runningContainers.length > 0) {
        console.log("   Services already running, skipping start")
        return
      }
    }
  } catch {
    // If ps command fails, services aren't running, continue with startup
  }
  
  // Start services in detached mode
  // We don't use --wait because NATS healthcheck can be unreliable
  // Instead, we manually verify service connections below
  const result = await $`docker compose up -d`.cwd("./test")
  // Output docker compose logs
  if (result.stdout) {
    console.log(result.stdout.toString())
  }
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr.toString())
    }
    throw new Error("Failed to start services")
  }
  
  // Wait for services to be healthy manually
  // Key services that must be healthy: postgres, redis, redis-sentinel, nats
  const requiredServices = ["test-postgres", "test-redis", "test-redis-sentinel", "test-nats"]
  let retries = 60 // Increased timeout for Sentinel startup
  while (retries > 0) {
    const statusResult = await $`docker compose ps --format json`.cwd("./test").quiet()
    const status = await statusResult.text()
    const containers = JSON.parse(`[${status.split("\n").filter(Boolean).join(",")}]`)
    
    // Check that all containers are running
    const allRunning = containers.every((c: { State: string }) => c.State === "running")
    
    // Check that required services are healthy
    const requiredHealthy = requiredServices.every((serviceName) => {
      const container = containers.find((c: { Service: string }) => c.Service === serviceName)
      if (!container) return false
      // Must be running and either no healthcheck or healthy
      return container.State === "running" && (!container.Health || container.Health === "healthy")
    })
    
    if (allRunning && requiredHealthy && containers.length >= requiredServices.length) {
      // Add extra wait time after healthcheck passes, especially in CI
      // PostgreSQL may be marked healthy but not yet ready to accept connections
      const isCI = process.env.CI === "true"
      if (isCI) {
        await Bun.sleep(3000) // Wait 3 seconds in CI after healthcheck passes
      } else {
        await Bun.sleep(1000) // Wait 1 second locally
      }
      
      // Verify services are actually connectable
      console.log("➖ Verifying service connections...")
      let redisReady = false
      let natsReady = false
      
      // Try to connect to services (with retries)
      // Use more retries in CI where services might take longer
      const maxRetries = isCI ? 40 : 20
      let postgresReady = false
      for (let i = 0; i < maxRetries; i++) {
        if (!redisReady) {
          redisReady = await verifyRedisConnection()
          if (!redisReady && i > 0 && i % 5 === 0) {
            console.log(`   Redis connection attempt ${i + 1}/${maxRetries}...`)
          }
        }
        if (!natsReady) {
          natsReady = await verifyNatsConnection()
        }
        if (!postgresReady) {
          postgresReady = await verifyPostgresConnection()
          if (!postgresReady && i > 0 && i % 5 === 0) {
            console.log(`   PostgreSQL connection attempt ${i + 1}/${maxRetries}...`)
          }
        }
        if (redisReady && natsReady && postgresReady) {
          // Wait a bit longer to ensure connections are fully established
          // This is especially important for PostgreSQL which may be marked healthy
          // but not yet ready to accept connections
          await Bun.sleep(isCI ? 3000 : 2000)
          console.log("✅")
          return
        }
        await Bun.sleep(isCI ? 1500 : 1000)
      }
      
      if (redisReady && natsReady && postgresReady) {
        // Wait a bit longer to ensure connections are fully established
        await Bun.sleep(isCI ? 3000 : 2000)
        console.log("✅")
        return
      }
      
      // Log which services failed
      const failedServices = []
      if (!redisReady) failedServices.push("Redis")
      if (!natsReady) failedServices.push("NATS")
      if (!postgresReady) failedServices.push("PostgreSQL")
      
      // In CI, fail hard if PostgreSQL isn't ready since it's required for tests
      if (isCI && !postgresReady) {
        console.error(`❌ PostgreSQL connection failed in CI after ${maxRetries} attempts`)
        console.error("   This is required for tests to run")
        throw new Error("PostgreSQL connection failed in CI")
      }
      
      console.log(`⚠️  Services not fully connectable: ${failedServices.join(", ")}`)
      console.log("   They may still work - services will retry on first use")
      return // Continue anyway - services will retry on first use
    }
    await Bun.sleep(1000)
    retries--
  }
  console.log("⚠️  (some services may not be fully ready)")
}

export const servicesDown = async () => {
  console.log("➖ Stopping services...")
  const result = await $`docker compose down -v --remove-orphans`.cwd("./test")
  // Output docker compose logs
  if (result.stdout) {
    console.log(result.stdout.toString())
  }
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr.toString())
    }
    throw new Error("Failed to stop services")
  }
  console.log("✅")
}

export const servicesResetAndMigrate = async () => {
  process.stdout.write("➖ Resetting and migrating services: ")
  const _start = performance.now()
  
  // Wait for PostgreSQL to be ready with retry and connection verification
  // Increase retries and wait time for CI environments where services might take longer
  const isCI = process.env.CI === "true"
  const connectionString = process.env.POSTGRES_CONNECTION_STRING || "postgresql://postgres:test@localhost:54321/bun_webhook_service_test"
  
  // Add initial delay to allow PostgreSQL to fully initialize after being marked healthy
  // This is especially important in CI where services might take longer
  if (isCI) {
    await Bun.sleep(3000) // Wait 3 seconds in CI after healthcheck passes
  } else {
    await Bun.sleep(1000) // Wait 1 second locally
  }
  
  // First, verify PostgreSQL is ready using a fresh connection
  // The module-level db connection might be closed if it was created before PostgreSQL was ready
  let retries = isCI ? 60 : 30 // More retries in CI
  let lastError: Error | null = null
  let connectionVerified = false
  
  while (retries > 0 && !connectionVerified) {
    try {
      // Create a fresh connection for verification
      const testClient = new Bun.SQL(connectionString)
      const testDb = drizzle({ client: testClient, schema: {} })
      await testDb.execute(sql`SELECT 1`)
      await testClient.close()
      connectionVerified = true
      break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const errorMessage = lastError.message.toLowerCase()
      
      // Check for common connection issues
      if (errorMessage.includes("connection closed") || errorMessage.includes("econnrefused")) {
        if (retries === 1) {
          console.error("\n❌ PostgreSQL connection failed.")
          console.error("   Make sure you're using the correct services:")
          console.error("   - For tests: use 'bun test:services:up' (uses test/docker-compose.yml)")
          console.error("   - For dev: use 'bun services:up' (uses docker-compose.dev.yml)")
          console.error(`   Error: ${lastError.message}`)
          throw lastError
        }
      } else if (retries === 1) {
        console.error("\n❌ PostgreSQL connection failed after retries:", lastError.message)
        throw lastError
      }
      // Wait before retrying - longer wait in CI
      await Bun.sleep(isCI ? 1000 : 500)
      retries--
    }
  }
  
  if (!connectionVerified) {
    throw new Error("PostgreSQL connection verification failed")
  }
  
  // Now try to use the module-level db connection
  // If it's still closed, we'll need to recreate it or wait a bit more
  retries = 10
  while (retries > 0) {
    try {
      await db.execute(sql`SELECT 1`)
      break
    } catch (error) {
      if (retries === 1) {
        // If the module-level connection is still closed, recreate it
        // We can't directly recreate it, but we can wait a bit more
        // The connection should eventually work since we verified PostgreSQL is ready
        console.warn("   Module-level db connection still closed, waiting...")
        await Bun.sleep(2000)
        try {
          await db.execute(sql`SELECT 1`)
        } catch (finalError) {
          console.error("\n❌ PostgreSQL connection failed after verification:", finalError instanceof Error ? finalError.message : String(finalError))
          throw finalError
        }
      }
      await Bun.sleep(500)
      retries--
    }
  }
  
  // Now perform the schema operations with error handling
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
    await db.execute(sql`CREATE SCHEMA public`)
  } catch (error) {
    console.error("\n❌ Failed to reset database schema:", error instanceof Error ? error.message : String(error))
    throw error
  }
  
  // Run migrations
  const exitCode = await Bun.spawn(["bun", "--env-file=.env.test", "drizzle-kit", "push"], {
    cwd: "./",
    stdout: "ignore",
    stderr: "inherit",
  }).exited
  if (exitCode !== 0) {
    throw new Error("Failed to migrate database")
  }
  console.log("✅")
}

// CLI interface for manual service management
if (import.meta.url === `file://${process.argv[1]}` && Bun.env.NODE_ENV === "test") {
  console.log("Running services fixture")
  switch (process.argv[2]) {
    case "action:up":
      await servicesUp()
      await servicesResetAndMigrate()
      break
    case "action:down":
      await servicesDown()
      break
  }
  process.exit(0)
}
