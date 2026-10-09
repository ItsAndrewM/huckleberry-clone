import { NotFound } from "@bt/contracts"
import { DurableObject } from "cloudflare:workers"
import { errorResponse } from "./error-response.ts"

export class HouseholdDO extends DurableObject {
  override fetch(): Response {
    return errorResponse(new NotFound())
  }
}

export const householdOf = (namespace: DurableObjectNamespace<HouseholdDO>) => namespace.getByName("household")
