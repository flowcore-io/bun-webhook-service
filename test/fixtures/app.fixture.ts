import { api } from "@/api"
import env from "@/env"

export class AppFixture {
  private server?: ReturnType<typeof Bun.serve>
  public readonly baseUrl: string

  constructor() {
    this.baseUrl = `http://localhost:${env.SERVICE_PORT}`
  }

  async start() {
    const server = Bun.serve({
      port: env.SERVICE_PORT,
      fetch: api.app.fetch,
    })
    this.server = server
  }

  async stop() {
    await this.server?.stop()
  }

  public async fetch(path: string, options: RequestInit = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: "Bearer BEARER_TOKEN",
        "Content-Type": "application/json",
        ...options.headers,
      },
    })
  }
}
