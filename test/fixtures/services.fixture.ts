import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"

export const servicesUp = async () => {
  console.log("➖ Starting services...")
  // Print connection strings for debugging
  const pgConn = process.env.POSTGRES_CONNECTION_STRING || 'not set'
  // Show full connection string (first 70 chars) to see actual format
  const pgPreview = pgConn.length > 70 ? `${pgConn.substring(0, 70)}...` : pgConn
  console.log(`📋 PostgreSQL (raw, length ${pgConn.length}): ${pgPreview}`)
  try {
    const pgUrl = new URL(pgConn)
    console.log(`📋 PostgreSQL (parsed): ${pgUrl.protocol}//${pgUrl.username}:****@${pgUrl.hostname}:${pgUrl.port}${pgUrl.pathname}`)
  } catch (e) {
    console.log(`📋 PostgreSQL (parse failed): ${pgConn}`)
    console.log(`📋 Parse error: ${e}`)
  }
  console.log(`📋 NATS: ${process.env.NATS_URL || 'not set'}`)
  console.log(`📋 Redis Sentinel: ${process.env.REDIS_SENTINEL_HOSTS || 'not set'}`)
  // In CI: clean environment, just start services normally
  // Local dev: user controls services manually
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
  // Key services that must be healthy: postgres, redis, redis-sentinel
  const requiredServices = ["test-postgres", "test-redis", "test-redis-sentinel"]
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
      console.log("✅")
      // Small delay to ensure PostgreSQL is fully ready to accept connections
      await Bun.sleep(2000)
      return
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
  console.log("➖ Resetting and migrating services...")
  const _start = performance.now()
  
  // Print connection string for debugging
  const connectionString = process.env.POSTGRES_CONNECTION_STRING || "not set"
  // Show first 70 chars to see the actual format (without masking)
  const preview = connectionString.length > 70 ? `${connectionString.substring(0, 70)}...` : connectionString
  console.log(`📋 PostgreSQL connection string (raw, length ${connectionString.length}): ${preview}`)
  // Parse and display connection string components (mask password)
  try {
    const url = new URL(connectionString)
    console.log(`📋 PostgreSQL connection string (parsed): ${url.protocol}//${url.username}:****@${url.hostname}:${url.port}${url.pathname}`)
  } catch (e) {
    console.log(`📋 PostgreSQL connection string (parse failed): ${connectionString}`)
    console.log(`📋 Parse error: ${e}`)
  }
  
  // First, wait for PostgreSQL to be ready using pg_isready
  let pgReadyRetries = 30
  while (pgReadyRetries > 0) {
    const pgReadyResult = await $`pg_isready -h localhost -p 54321 -U postgres`.quiet().nothrow()
    if (pgReadyResult.exitCode === 0) {
      console.log("✅ PostgreSQL is ready (pg_isready)")
      break
    }
    if (pgReadyRetries === 1) {
      throw new Error("PostgreSQL is not ready after 30 retries")
    }
    await Bun.sleep(1000)
    pgReadyRetries--
  }
  
  // Small delay to ensure PostgreSQL is fully ready to accept connections
  await Bun.sleep(2000)
  
  // Now try to connect with the database client
  let retries = 30
  while (retries > 0) {
    try {
      await db.execute(sql`SELECT 1`)
      console.log("✅ Database connection successful")
      break
    } catch (error) {
      if (retries === 1) {
        console.error("Failed to connect to PostgreSQL:", error)
        console.error(`Connection string used: ${connectionString.replace(/:[^:@]+@/, ':****@')}`)
        throw error
      }
      await Bun.sleep(1000)
      retries--
    }
  }
  
  await db.execute(sql`DROP SCHEMA public CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
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
