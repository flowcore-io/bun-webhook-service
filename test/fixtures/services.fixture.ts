import { db } from "@/database"
import { $ } from "bun"
import { sql } from "drizzle-orm"

export const servicesUp = async () => {
  process.stdout.write("➖ Starting services: ")
  const exitCode = await (await $`docker compose up --wait -d`.cwd("./test").quiet()).exitCode
  if (exitCode !== 0) {
    throw new Error("Failed to start services")
  }
  console.log("✅")
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
  let connectionString = process.env.POSTGRES_CONNECTION_STRING || "not set"
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
  // Use 127.0.0.1 instead of localhost in CI environments (GitHub Actions)
  // Also ensure connection string uses 127.0.0.1 in CI
  if (process.env.CI === "true" && connectionString.includes("localhost")) {
    connectionString = connectionString.replace(/localhost/g, "127.0.0.1")
    process.env.POSTGRES_CONNECTION_STRING = connectionString
  }
  const pgHost = process.env.CI === "true" ? "127.0.0.1" : "localhost"
  let pgReadyRetries = 30
  while (pgReadyRetries > 0) {
    const pgReadyResult = await $`pg_isready -h ${pgHost} -p 54321 -U postgres`.quiet().nothrow()
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
  // Log what the database client is actually using (from env module if available)
  try {
    const env = await import("@/env")
    console.log(`📋 Database client connection string (from env module, length ${env.default.POSTGRES_CONNECTION_STRING.length}): ${env.default.POSTGRES_CONNECTION_STRING.substring(0, 70)}${env.default.POSTGRES_CONNECTION_STRING.length > 70 ? '...' : ''}`)
  } catch (e) {
    console.log(`📋 Could not load env module: ${e}`)
  }
  
  let retries = 30
  while (retries > 0) {
    try {
      await db.execute(sql`SELECT 1`)
      console.log("✅ Database connection successful")
      break
    } catch (error) {
      if (retries === 1) {
        console.error("Failed to connect to PostgreSQL:", error)
        console.error(`Connection string from process.env: ${connectionString.substring(0, 70)}`)
        console.error(`Connection string from env module: ${env.POSTGRES_CONNECTION_STRING.substring(0, 70)}`)
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
