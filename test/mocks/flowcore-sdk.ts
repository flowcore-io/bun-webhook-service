import { mock } from "bun:test"
import type { Command } from "@flowcore/sdk"

mock.module("@flowcore/sdk", () => ({
  ...require("@flowcore/sdk"),
  FlowcoreClient: FlowcoreClientMocked,
}))

const flowcoreClientResponses: Record<string, unknown[]> = {}

export function mockFlowcoreClientResponse(command: string, response: unknown) {
  flowcoreClientResponses[command] ??= []
  flowcoreClientResponses[command].push(response)
}

export function mockFlowcoreClientAssertConsumed() {
  for (const command of Object.keys(flowcoreClientResponses)) {
    if (flowcoreClientResponses[command]?.length && flowcoreClientResponses[command].length > 0) {
      throw new Error(`Mocked responses for ${command} not consumed`)
    }
  }
}

class FlowcoreClientMocked {
  public async execute(command: Command<unknown, unknown>) {
    if (flowcoreClientResponses[command.constructor.name]) {
      const response = flowcoreClientResponses[command.constructor.name]?.shift()
      return response
    }
    throw new Error("NO MOCKED RESPONSE")
  }
}
