import * as schemas from "./tables"
import env from "@/env"
import { drizzle } from "drizzle-orm/bun-sql"
import { SQL } from "bun"

const client = new SQL(env.POSTGRES_CONNECTION_STRING)

export const db = drizzle({
	client,
	schema: schemas,
	logger: env.POSTGRES_LOG_QUERY,
})
