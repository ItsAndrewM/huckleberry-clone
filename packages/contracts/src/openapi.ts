import { OpenApi } from "effect/http-api"
import { Api } from "./api.ts"

export const apiDocument = () => `${JSON.stringify(OpenApi.fromApi(Api), null, 2)}\n`
