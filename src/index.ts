import api from "@/api"
import env from "@/env"

export default {
  port: env.SERVICE_PORT,
  fetch: api.app.fetch,
}
