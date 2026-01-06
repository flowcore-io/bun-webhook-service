import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/index.ts",
  dbCredentials: {
    url: process.env.POSTGRES_CONNECTION_STRING as string,
  },
})
