import { Context } from "effect"
import { HttpApi, HttpApiMiddleware, OpenApi } from "effect/http-api"
import { DiapersGroup } from "./diapers.ts"
import { InvalidInput, Unauthorized } from "./errors.ts"
import { FeedsGroup, PortionsGroup, SegmentsGroup } from "./feeds.ts"
import { GrowthGroup } from "./growth.ts"
import { ChildGroup, HouseholdGroup } from "./household.ts"
import { type Caregiver, MeGroup } from "./me.ts"
import { TodayGroup } from "./today.ts"

export class CurrentCaregiver extends Context.Service<CurrentCaregiver, Caregiver>()("bt/CurrentCaregiver") {}

export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentCaregiver }>()(
  "bt/Authorization",
  { error: Unauthorized },
) {}

export class InvalidInputs extends HttpApiMiddleware.Service<InvalidInputs>()("bt/InvalidInputs", {
  error: InvalidInput,
}) {}

export class Api extends HttpApi.make("baby-tracker")
  .add(MeGroup)
  .add(HouseholdGroup)
  .add(ChildGroup)
  .add(TodayGroup)
  .add(DiapersGroup)
  .add(FeedsGroup)
  .add(SegmentsGroup)
  .add(PortionsGroup)
  .add(GrowthGroup)
  .prefix("/api")
  .middleware(InvalidInputs)
  .middleware(Authorization)
  .annotate(HttpApi.ParseOptions, { errors: "all" })
  .annotate(OpenApi.Title, "Baby tracker") {}
