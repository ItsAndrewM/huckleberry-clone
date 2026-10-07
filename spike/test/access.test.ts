import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, SignJWT, UnsecuredJWT } from "jose"
import { beforeAll, describe, expect, it } from "vitest"
import { resolveIdentity, verifyAccessJwt } from "../src/access.ts"

const TEAM = "https://bt-test.cloudflareaccess.com"
const AUD = "aud-tag-123"
const config = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

let keys: JWTVerifyGetKey
let privateKey: CryptoKey

const sign = (claims: Record<string, unknown>, overrides: { iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(overrides.iss ?? TEAM)
    .setAudience([overrides.aud ?? AUD])
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "1h")
    .sign(privateKey)

const ctxWith = (identity?: Record<string, unknown>) =>
  ({
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    access: identity === undefined ? undefined : { aud: AUD, getIdentity: async () => identity },
  }) as unknown as ExecutionContext

const requestWith = (token?: string) =>
  new Request("https://bt.example.test/api/me", token === undefined ? {} : { headers: { "cf-access-jwt-assertion": token } })

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true })
  privateKey = pair.privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] })
})

describe("verifyAccessJwt", () => {
  const options = () => ({ keys, issuer: TEAM, audience: AUD })

  it("accepts a token for this team and app, returning its claims", async () => {
    const claims = await verifyAccessJwt(await sign({ email: "andrew@example.test", type: "app" }), options())
    expect(claims).toMatchObject({ email: "andrew@example.test", aud: [AUD], iss: TEAM })
  })

  it.each([
    ["another app's audience", { aud: "other-app" }],
    ["another team's issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["an expired token", { exp: "-1m" }],
  ])("rejects %s", async (_label, overrides) => {
    await expect(verifyAccessJwt(await sign({ email: "a@example.test" }, overrides), options())).rejects.toThrow()
  })

  it("rejects an unsigned token", async () => {
    const unsigned = new UnsecuredJWT({ email: "a@example.test" }).setIssuer(TEAM).setAudience(AUD).encode()
    await expect(verifyAccessJwt(unsigned, options())).rejects.toThrow()
  })
})

describe("resolveIdentity", () => {
  it("prefers ctx.access when the runtime provides it", async () => {
    const resolved = await resolveIdentity(requestWith(), config, ctxWith({ email: "andrew@example.test" }), keys)
    expect(resolved).toEqual({ via: "ctx.access", claims: { email: "andrew@example.test" } })
  })

  it("falls back to the JWT header when ctx.access is absent (Static Assets router)", async () => {
    const resolved = await resolveIdentity(requestWith(await sign({ email: "emily@example.test" })), config, ctxWith(), keys)
    expect(resolved?.via).toBe("jwt")
    expect(resolved?.claims["email"]).toBe("emily@example.test")
  })

  it("reads a service token's Client ID from common_name", async () => {
    const token = await sign({ common_name: "abc123.access", sub: "" })
    const resolved = await resolveIdentity(requestWith(token), config, ctxWith(), keys)
    expect(resolved?.claims["common_name"]).toBe("abc123.access")
  })

  it("returns nothing for a tampered token, a missing header, or unconfigured verification", async () => {
    const token = await sign({ email: "emily@example.test" })
    const [header, , signature] = token.split(".")
    const forgedPayload = btoa(JSON.stringify({ email: "attacker@example.test", iss: TEAM, aud: [AUD], exp: 9e9 }))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
    expect(await resolveIdentity(requestWith(`${header}.${forgedPayload}.${signature}`), config, ctxWith(), keys)).toBeUndefined()
    expect(await resolveIdentity(requestWith(), config, ctxWith(), keys)).toBeUndefined()
    expect(await resolveIdentity(requestWith(token), { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }, ctxWith(), keys)).toBeUndefined()
  })
})
