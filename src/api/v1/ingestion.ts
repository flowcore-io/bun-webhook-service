import { AuthType, HonoApiRouter } from "@flowcore/hono-api"
import { z } from "zod"
import type { PathwaysBuilder } from "@flowcore/pathways"

export const ingestionRouter = new HonoApiRouter<PathwaysBuilder<any, any> | undefined>()

const IngestionSchema = z.object({
  flowType: z.string(),
  eventType: z.string(),
  data: z.any(),
  metadata: z.record(z.string(), z.any()).optional(),
})

ingestionRouter.post("/ingest", {
  tags: ["ingestion"],
  summary: "Ingest Flowcore events",
  auth: {
    type: [AuthType.Bearer, AuthType.ApiKey],
    permissions: (input) => [
      {
        action: "write",
        resource: [`frn::${input.body.flowType}:*`],
      },
    ],
  },
  input: {
    body: IngestionSchema,
  },
  output: z.object({
    received: z.boolean(),
    eventType: z.string(),
    flowType: z.string(),
  }),
  handler: async ({ body, pathways }) => {
    // Pathways integration - if pathways is configured, write the event
    if (pathways) {
      await (pathways as PathwaysBuilder<any, any>).write(`${body.flowType}/${body.eventType}`, {
        data: body.data,
        metadata: body.metadata,
      })
    }
    return {
      received: true,
      eventType: body.eventType,
      flowType: body.flowType,
    }
  },
})
