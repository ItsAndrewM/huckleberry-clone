import { Context } from "effect"
import { HttpApi, HttpApiMiddleware, OpenApi } from "effect/http-api"
import { DeletedGroup } from "./deleted.ts"
import { DiapersGroup } from "./diapers.ts"
import { InvalidInput, Unauthorized } from "./errors.ts"
import { ExportGroup } from "./export.ts"
import { FeedsGroup, PortionsGroup, SegmentsGroup } from "./feeds.ts"
import { GrowthGroup } from "./growth.ts"
import { ChildGroup, HouseholdGroup } from "./household.ts"
import { type Caregiver, MeGroup } from "./me.ts"
import { PeriodsGroup } from "./periods.ts"
import { SleepsGroup } from "./sleeps.ts"
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
  .add(SleepsGroup)
  .add(GrowthGroup)
  .add(ExportGroup)
  .add(PeriodsGroup)
  .add(DeletedGroup)
  .prefix("/api")
  .middleware(InvalidInputs)
  .middleware(Authorization)
  .annotate(HttpApi.ParseOptions, { errors: "all" })
  .annotate(OpenApi.Title, "Baby tracker") {}
