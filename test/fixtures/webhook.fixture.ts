import { type Mock, jest } from "bun:test"
import { HonoApi } from "@flowcore/hono-api"
import type { FlowcoreEvent } from "@flowcore/pathways"

export type WebhookTestFixtureOptions = {
  tenant: string
  dataCore: string
  port: number
  secret: string
  transformerUrl: string
}

export type WebhookSpy = Mock<(...args: unknown[]) => void | Promise<void>>

export class WebhookTestFixture<T extends Record<string, Record<string, WebhookSpy>> = Record<never, never>> {
  private server?: ReturnType<typeof Bun.serve>
  private api: HonoApi
  public readonly spies: T = {} as T
  private readonly spiesArray: WebhookSpy[] = []

  constructor(private readonly options: WebhookTestFixtureOptions) {
    this.api = new HonoApi({})
    this.api.app.get("/health", (ctx) => {
      return ctx.json({ status: "ok" })
    })
  }

  public addEndpoint<F extends string, E extends string>(
    flowType: F,
    eventType: E,
    redirectToTransformer?: boolean,
  ): WebhookTestFixture<T & Record<F, Record<E, WebhookSpy>>> {
    const spy = jest.fn()

    if (!this.spies[flowType]) {
      this.spies[flowType] = {} as T[F]
    }
    ;(this.spies[flowType] as Record<E, WebhookSpy>)[eventType] = spy
    this.spiesArray.push(spy)

    this.api.app.post(
      `/event/${this.options.tenant}/${this.options.dataCore}/${flowType}/${eventType}`,
      async (ctx) => {
        // Parse metadata and event times from headers
        let metadata: Record<string, string> | undefined
        let eventTimes: Record<string, string> | undefined
        if (ctx.req.header("x-flowcore-metadata-json")) {
          metadata = JSON.parse(
            Buffer.from(ctx.req.header("x-flowcore-metadata-json") as string, "base64").toString("utf-8"),
          )
        }
        if (ctx.req.header("x-flowcore-event-time") || ctx.req.header("x-flowcore-valid-time")) {
          eventTimes = {
            ...(ctx.req.header("x-flowcore-event-time") ? { eventTime: ctx.req.header("x-flowcore-event-time") } : {}),
            ...(ctx.req.header("x-flowcore-valid-time") ? { validTime: ctx.req.header("x-flowcore-valid-time") } : {}),
          }
        }
        const payload = await ctx.req.raw.json()
        const validTime = ctx.req.header("x-flowcore-valid-time") ?? new Date().toISOString()
        const validTimeDate = new Date(validTime)
        const event: FlowcoreEvent = {
          eventId: crypto.randomUUID(),
          flowType: flowType,
          dataCoreId: this.options.dataCore,
          tenant: this.options.tenant,
          timeBucket: [
            validTimeDate.getUTCFullYear().toString(),
            (validTimeDate.getUTCMonth() + 1).toString().padStart(2, "0"),
            validTimeDate.getUTCDate().toString().padStart(2, "0"),
            validTimeDate.getUTCHours().toString().padStart(2, "0"),
            "00",
            "00",
          ].join(""),
          eventType: eventType,
          validTime,
          payload,
          metadata: metadata ?? {},
        }

        // Optionally forward to transformer endpoint
        if (redirectToTransformer) {
          const response = await fetch(this.options.transformerUrl, {
            method: "POST",
            body: JSON.stringify(event),
            headers: {
              "Content-Type": "application/json",
              "x-secret": this.options.secret,
            },
          })

          if (![200, 201].includes(response.status)) {
            throw new Error(
              `Received non-success status code: ${response.status} (${response.statusText}) with body ${await response.text()}`,
            )
          }
        }

        spy(payload, metadata, eventTimes)

        return ctx.json({ eventId: event.eventId })
      },
    )

    return this as WebhookTestFixture<T & Record<F, Record<E, WebhookSpy>>>
  }

  public async stop() {
    await this.server?.stop()
    this.server = undefined
  }

  public async start() {
    await this.stop()
    this.clear()
    this.server = Bun.serve({
      port: this.options.port,
      fetch: this.api.app.fetch,
    })
  }

  public clear() {
    for (const spy of this.spiesArray) {
      spy.mockClear()
    }
  }
}
