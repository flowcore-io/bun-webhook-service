import env from "@/env";
import { createPostgresPathwayState, PathwaysBuilder } from "@flowcore/pathways";
import { dataCoreContract, eventTypeContract, flowTypeContract } from "./contracts";
import {
  handleDataCoreCreated,
  handleDataCoreDeleted,
  handleDataCoreUpdated,
} from "./handlers/flowcore-platform/data-core";
import {
  handleEventTypeCreated,
  handleEventTypeDeleted,
  handleEventTypeUpdated,
} from "./handlers/flowcore-platform/event-type";
import {
  handleFlowTypeCreated,
  handleFlowTypeDeleted,
  handleFlowTypeUpdated,
} from "./handlers/flowcore-platform/flow-type";

// Create Pathways builder for subscribing to Flowcore platform events
export const pathways = new PathwaysBuilder({
  baseUrl: env.FLOWCORE_WEBHOOK_BASEURL || "https://webhook.api.flowcore.io",
  tenant: "flowcore",
  dataCore: "flowcore-platform",
  apiKey: env.FLOWCORE_WEBHOOK_API_KEY || "",
})
  .withPathwayState(
    createPostgresPathwayState({
      connectionString: env.POSTGRES_CONNECTION_STRING,
      tableName: "_pathways_state",
    })
  )
  // Register data core events
  .register({
    flowType: dataCoreContract.Contract.flowType,
    eventType: dataCoreContract.Contract.eventTypes.created,
    schema: dataCoreContract.Contract.schemas.created,
  })
  .handle(
    `${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.created}`,
    handleDataCoreCreated
  )
  .register({
    flowType: dataCoreContract.Contract.flowType,
    eventType: dataCoreContract.Contract.eventTypes.updated,
    schema: dataCoreContract.Contract.schemas.updated,
  })
  .handle(
    `${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.updated}`,
    handleDataCoreUpdated
  )
  .register({
    flowType: dataCoreContract.Contract.flowType,
    eventType: dataCoreContract.Contract.eventTypes.deleted,
    schema: dataCoreContract.Contract.schemas.deleted,
  })
  .handle(
    `${dataCoreContract.Contract.flowType}/${dataCoreContract.Contract.eventTypes.deleted}`,
    handleDataCoreDeleted
  )
  // Register flow type events
  .register({
    flowType: flowTypeContract.Contract.flowType,
    eventType: flowTypeContract.Contract.eventTypes.created,
    schema: flowTypeContract.Contract.schemas.created,
  })
  .handle(
    `${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.created}`,
    handleFlowTypeCreated
  )
  .register({
    flowType: flowTypeContract.Contract.flowType,
    eventType: flowTypeContract.Contract.eventTypes.updated,
    schema: flowTypeContract.Contract.schemas.updated,
  })
  .handle(
    `${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.updated}`,
    handleFlowTypeUpdated
  )
  .register({
    flowType: flowTypeContract.Contract.flowType,
    eventType: flowTypeContract.Contract.eventTypes.deleted,
    schema: flowTypeContract.Contract.schemas.deleted,
  })
  .handle(
    `${flowTypeContract.Contract.flowType}/${flowTypeContract.Contract.eventTypes.deleted}`,
    handleFlowTypeDeleted
  )
  // Register event type events
  .register({
    flowType: eventTypeContract.Contract.flowType,
    eventType: eventTypeContract.Contract.eventTypes.created,
    schema: eventTypeContract.Contract.schemas.created,
  })
  .handle(
    `${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.created}`,
    handleEventTypeCreated
  )
  .register({
    flowType: eventTypeContract.Contract.flowType,
    eventType: eventTypeContract.Contract.eventTypes.updated,
    schema: eventTypeContract.Contract.schemas.updated,
  })
  .handle(
    `${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.updated}`,
    handleEventTypeUpdated
  )
  .register({
    flowType: eventTypeContract.Contract.flowType,
    eventType: eventTypeContract.Contract.eventTypes.deleted,
    schema: eventTypeContract.Contract.schemas.deleted,
  })
  .handle(
    `${eventTypeContract.Contract.flowType}/${eventTypeContract.Contract.eventTypes.deleted}`,
    handleEventTypeDeleted
  );
