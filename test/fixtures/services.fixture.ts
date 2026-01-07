import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"

export const servicesUp = async () => {
  process.stdout.write("➖ Starting services: ")
  // Start services without --wait to avoid NATS healthcheck issues
  const exitCode = await (await $`docker compose up -d`.cwd("./test").quiet()).exitCode
  if (exitCode !== 0) {
    throw new Error("Failed to start services")
  }
  // Wait for critical services manually
  let retries = 60
  while (retries > 0) {
    const statusResult = await $`docker compose ps --format json`.cwd("./test").quiet()
    const status = await statusResult.text()
    const containers = JSON.parse(`[${status.split("\n").filter(Boolean).join(",")}]`)
    const postgres = containers.find((c: { Service: string }) => c.Service === "test-postgres")
    const redis = containers.find((c: { Service: string }) => c.Service === "test-redis")
    const sentinel = containers.find((c: { Service: string }) => c.Service === "test-redis-sentinel")
    if (
      postgres?.State === "running" &&
      (postgres?.Health === "healthy" || !postgres?.Health) &&
      redis?.State === "running" &&
      (redis?.Health === "healthy" || !redis?.Health) &&
      sentinel?.State === "running" &&
      (sentinel?.Health === "healthy" || !sentinel?.Health)
    ) {
      console.log("✅")
      return
    }
    await Bun.sleep(1000)
    retries--
  }
  throw new Error("Services did not become healthy in time")
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
  
  // Wait for database to be ready
  let retries = 30
  while (retries > 0) {
    try {
      await db.execute(sql`SELECT 1`)
      break
    } catch (error) {
      if (retries === 1) {
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
