import { type Mock, spyOn } from "bun:test"
import { HonoApi } from "@flowcore/hono-api"
import * as jose from "jose"

interface FlowcoreAuthenticatedUser {
  id: string
  email?: string
  isFlowcoreAdmin?: boolean
}

interface FlowcoreJWTPayload {
  flowcore_user_id: string
  email: string
  is_flowcore_admin: boolean
}

export class AuthFixture {
  private authenticateMock?: Mock<typeof jose.jwtVerify>
  private authorizeServer?: ReturnType<typeof Bun.serve>

  start() {
    if (this.authenticateMock) {
      return
    }
    // Mock JWT verification to throw by default
    this.authenticateMock = spyOn(jose, "jwtVerify").mockImplementation(async () => {
      await Bun.sleep(0)
      throw new Error("Auth fixture not mocked")
    })

    // Mock IAM validation server
    const authorizeApp = new HonoApi({})
    authorizeApp.app.post("/api/v1/validate/:type/:id", async (c) => {
      return c.json({
        valid: true,
        checksum: Math.random().toString(36).substring(2, 15),
      })
    })
    this.authorizeServer = Bun.serve({
      port: 8888,
      fetch: authorizeApp.app.fetch,
    })
  }

  async stop() {
    this.authenticateMock?.mockRestore()
    await this.authorizeServer?.stop()
  }

  setUnauthorizedUser() {
    this.authenticateMock?.mockImplementation(async () => {
      await Bun.sleep(0)
      throw new Error("Auth Fixture Unauthorized")
    })
  }

  setAuthorizedUser(user: FlowcoreAuthenticatedUser, persist?: boolean) {
    const payload: FlowcoreJWTPayload = {
      flowcore_user_id: user.id,
      email: user.email ?? "test@test.com",
      is_flowcore_admin: user.isFlowcoreAdmin ?? false,
    }
    this.authenticateMock?.[persist ? "mockResolvedValue" : "mockResolvedValueOnce"]({
      key: new Uint8Array(),
      protectedHeader: "" as any,
      payload: payload as any,
    })
  }
}
