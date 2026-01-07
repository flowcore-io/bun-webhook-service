import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"

export const servicesUp = async () => {
  process.stdout.write("➖ Starting services: ")
  // Stop any existing containers first to avoid port conflicts
  // Use down without -v first, then remove orphans, then force recreate
  await $`docker compose down --remove-orphans`.cwd("./test").quiet().catch(() => {
    // Ignore errors if containers don't exist
  })
  // Small delay to ensure Docker has cleaned up
  await Bun.sleep(500)
  // Start services with force recreate to avoid dependency issues
  const exitCode = await (await $`docker compose up -d --force-recreate --remove-orphans`.cwd("./test").quiet()).exitCode
  if (exitCode !== 0) {
    throw new Error("Failed to start services")
  }
  
  // Wait for services to be healthy manually
  // Key services that must be healthy: postgres, redis, redis-sentinel
  const requiredServices = ["test-postgres", "test-redis", "test-redis-sentinel"]
  let retries = 60 // Increased timeout for Sentinel startup
  while (retries > 0) {
    const status = await (await $`docker compose ps --format json`.cwd("./test").quiet()).text()
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
      return
    }
    await Bun.sleep(1000)
    retries--
  }
  console.log("⚠️  (some services may not be fully ready)")
}

export const servicesDown = async () => {
  process.stdout.write("➖ Stopping services: ")
  const exitCode = await (await $`docker compose down -v --remove-orphans`.cwd("./test").quiet()).exitCode
  if (exitCode !== 0) {
    throw new Error("Failed to stop services")
  }
  console.log("✅")
}

export const servicesResetAndMigrate = async () => {
  process.stdout.write("➖ Resetting and migrating services: ")
  const _start = performance.now()
  
  // Wait for PostgreSQL to be ready
  let retries = 30
  while (retries > 0) {
    try {
      await db.execute(sql`SELECT 1`)
      break
    } catch (error) {
      if (retries === 1) throw error
      await Bun.sleep(500)
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
