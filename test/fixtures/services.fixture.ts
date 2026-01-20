import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"

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
async function verifyPostgresConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
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
      // Verify services are actually connectable
      console.log("➖ Verifying service connections...")
      let redisReady = false
      let natsReady = false
      
      // Try to connect to services (with retries)
      let postgresReady = false
      for (let i = 0; i < 20; i++) { // Increased retries for Redis Sentinel
        if (!redisReady) {
          redisReady = await verifyRedisConnection()
          if (!redisReady && i > 0 && i % 5 === 0) {
            console.log(`   Redis connection attempt ${i + 1}/20...`)
          }
        }
        if (!natsReady) {
          natsReady = await verifyNatsConnection()
        }
        if (!postgresReady) {
          postgresReady = await verifyPostgresConnection()
        }
        if (redisReady && natsReady && postgresReady) {
          console.log("✅")
          return
        }
        await Bun.sleep(1000)
      }
      
      if (redisReady && natsReady && postgresReady) {
        console.log("✅")
        return
      }
      
      // Log which services failed
      const failedServices = []
      if (!redisReady) failedServices.push("Redis")
      if (!natsReady) failedServices.push("NATS")
      if (!postgresReady) failedServices.push("PostgreSQL")
      
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
  let retries = isCI ? 60 : 30 // More retries in CI
  let lastError: Error | null = null
  while (retries > 0) {
    try {
      // Try to execute a simple query to verify connection
      await db.execute(sql`SELECT 1`)
      // Connection is good, break out of retry loop
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
