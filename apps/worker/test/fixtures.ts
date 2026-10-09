import { env } from "cloudflare:test"

export const newHousehold = () => env.HOUSEHOLD.getByName(crypto.randomUUID())
