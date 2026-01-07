import { api } from "@/api"
import env from "@/env"

export class AppFixture {
  private server?: ReturnType<typeof Bun.serve>
  private _port?: number

  constructor() {
    // Port will be read dynamically when needed
  }

  get baseUrl(): string {
    // Read from process.env directly to ensure we get the latest value, especially in tests
    const port = this._port || Number(process.env.SERVICE_PORT) || env.SERVICE_PORT
    return `http://localhost:${port}`
  }

  async start() {
    // Read from process.env directly to ensure we get the latest value, especially in tests
    const port = Number(process.env.SERVICE_PORT) || env.SERVICE_PORT
    this._port = port
    const server = Bun.serve({
      port,
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
