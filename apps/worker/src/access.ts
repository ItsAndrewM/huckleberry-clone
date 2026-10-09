import { Option, Schema } from "effect"
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose"

export type Caller =
  | { readonly kind: "user"; readonly email: string }
  | { readonly kind: "service"; readonly clientId: string }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "keys-unavailable" }

export interface AccessSettings {
  readonly ACCESS_TEAM_DOMAIN?: string
  readonly ACCESS_AUD?: string
}

export type AccessKeysFor = (teamDomain: string) => JWTVerifyGetKey

const UNAUTHENTICATED: Caller = { kind: "unauthenticated" }
const KEYS_UNAVAILABLE: Caller = { kind: "keys-unavailable" }

const HttpsOrigin = Schema.String.check(
  Schema.makeFilter(
    (value: string) => {
      const parsed = URL.parse(value)
      return parsed?.protocol === "https:" && parsed.origin === value
    },
    { expected: "an https origin like https://team.cloudflareaccess.com" },
  ),
)

const JwtSettings = Schema.Struct({ ACCESS_TEAM_DOMAIN: HttpsOrigin, ACCESS_AUD: Schema.NonEmptyString })
const jwtSettingsOf = Schema.decodeUnknownOption(JwtSettings)

const Claims = Schema.Struct({ email: Schema.optional(Schema.String), common_name: Schema.optional(Schema.String) })
const claimsOf = Schema.decodeUnknownOption(Claims)

const callerFrom = ({ email, common_name }: typeof Claims.Type): Caller => {
  if (email !== undefined && email !== "") return { kind: "user", email: email.toLowerCase() }
  if (common_name !== undefined && common_name !== "") return { kind: "service", clientId: common_name }
  return UNAUTHENTICATED
}

const callerFromClaims = (claims: JWTPayload | CloudflareAccessIdentity): Caller =>
  Option.match(claimsOf(claims), { onNone: () => UNAUTHENTICATED, onSome: callerFrom })

class AccessKeysUnavailable extends Error {}

const reportingOutages =
  (keys: JWTVerifyGetKey): JWTVerifyGetKey =>
  async (header, token) => {
    try {
      return await keys(header, token)
    } catch (error) {
      if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) throw error
      throw new AccessKeysUnavailable("Cloudflare Access signing keys are unavailable", { cause: error })
    }
  }

const verifiedCaller = async (
  token: string,
  settings: typeof JwtSettings.Type,
  keys: JWTVerifyGetKey,
): Promise<Caller> => {
  try {
    const { payload } = await jwtVerify(token, reportingOutages(keys), {
      issuer: settings.ACCESS_TEAM_DOMAIN,
      audience: settings.ACCESS_AUD,
      algorithms: ["RS256"],
    })
    return callerFromClaims(payload)
  } catch (error) {
    return error instanceof AccessKeysUnavailable ? KEYS_UNAVAILABLE : UNAUTHENTICATED
  }
}

export const callerOf = async (
  request: Request,
  access: CloudflareAccessContext | undefined,
  settings: AccessSettings,
  keysFor: AccessKeysFor,
): Promise<Caller> => {
  const identity = await access?.getIdentity()
  if (identity !== undefined) return callerFromClaims(identity)
  const token = request.headers.get("cf-access-jwt-assertion")
  const jwt = jwtSettingsOf(settings)
  if (token === null || Option.isNone(jwt)) return UNAUTHENTICATED
  return verifiedCaller(token, jwt.value, keysFor(jwt.value.ACCESS_TEAM_DOMAIN))
}

const remoteKeys = new Map<string, JWTVerifyGetKey>()

export const remoteAccessKeys: AccessKeysFor = (teamDomain) => {
  const cached = remoteKeys.get(teamDomain)
  if (cached !== undefined) return cached
  const keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain))
  remoteKeys.set(teamDomain, keys)
  return keys
}
