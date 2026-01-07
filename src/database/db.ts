import * as schemas from "./tables"
import env from "@/env"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

// Use process.env directly to ensure we get the latest value, especially in tests
const connectionString = process.env.POSTGRES_CONNECTION_STRING || env.POSTGRES_CONNECTION_STRING

const pool = new Pool({
	connectionString,
})

export const db = drizzle(pool, {
	schema: schemas,
	logger: env.POSTGRES_LOG_QUERY,
})
