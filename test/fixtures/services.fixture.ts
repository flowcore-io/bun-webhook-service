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
  
  // Wait a bit for database to be fully ready after healthcheck passes
  await Bun.sleep(2000)
  
  // Import database - environment variables should be set by test/setup.ts
  const { db } = await import("@/database")
  
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
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
