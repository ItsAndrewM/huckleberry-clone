/**
 * Resolves the Cloudflare Access identity for a request.
 *
 * `ctx.access` is preferred, but Cloudflare documents that Workers with Static
 * Assets run behind an internal router that does not forward it. In that case
 * the `Cf-Access-Jwt-Assertion` header is verified against the team's JWKS.
 * `via` records which path produced the identity (S2/S5 in spike-results.md).
 */
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose"

export type AccessClaims = Record<string, unknown>

export interface ResolvedIdentity {
  readonly via: "ctx.access" | "jwt"
  readonly claims: AccessClaims
}

export interface AccessConfig {
  readonly ACCESS_TEAM_DOMAIN: string
  readonly ACCESS_AUD: string
}

const remoteKeys = new Map<string, JWTVerifyGetKey>()

const keysFor = (teamDomain: string): JWTVerifyGetKey => {
  let keys = remoteKeys.get(teamDomain)
  if (keys === undefined) {
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain))
    remoteKeys.set(teamDomain, keys)
  }
  return keys
}

export const verifyAccessJwt = async (
  token: string,
  options: { keys: JWTVerifyGetKey; issuer: string; audience: string },
): Promise<AccessClaims> => {
  const { payload } = await jwtVerify(token, options.keys, {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: ["RS256"],
  })
  return payload
}

export const resolveIdentity = async (
  request: Request,
  config: AccessConfig,
  ctx: ExecutionContext,
  keys?: JWTVerifyGetKey,
): Promise<ResolvedIdentity | undefined> => {
  const fromContext = await ctx.access?.getIdentity()
  if (fromContext !== undefined) return { via: "ctx.access", claims: fromContext }

  const token = request.headers.get("cf-access-jwt-assertion")
  if (token === null || config.ACCESS_TEAM_DOMAIN === "" || config.ACCESS_AUD === "") return undefined
  try {
    const claims = await verifyAccessJwt(token, {
      keys: keys ?? keysFor(config.ACCESS_TEAM_DOMAIN),
      issuer: config.ACCESS_TEAM_DOMAIN,
      audience: config.ACCESS_AUD,
    })
    return { via: "jwt", claims }
  } catch (error) {
    console.warn("access jwt rejected", String(error))
    return undefined
  }
}

export const stringClaim = (claims: AccessClaims, name: string): string | undefined => {
  const value = claims[name]
  return typeof value === "string" && value !== "" ? value : undefined
}
