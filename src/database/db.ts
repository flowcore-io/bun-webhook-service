import * as schemas from "./index"
import env from "@/env"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: env.POSTGRES_CONNECTION_STRING,
})

export const db: NodePgDatabase<typeof schemas> = drizzle(pool, {
  schema: schemas,
  logger: env.POSTGRES_LOG_QUERY,
})
