import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
  UnsecuredJWT,
} from "jose"
import { beforeAll, describe, expect, it } from "vitest"
import { type AccessSettings, callerOf } from "../src/access.ts"

const TEAM = "https://bt-test.cloudflareaccess.com"
const AUD = "bt-test-aud"
const SETTINGS: AccessSettings = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

let keys: JWTVerifyGetKey
let privateKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true })
  privateKey = pair.privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] })
})

interface TokenOptions {
  readonly issuer?: string
  readonly audience?: string | string[]
  readonly expiresIn?: string
  readonly keyId?: string
}

const sign = (claims: JWTPayload, options: TokenOptions = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.keyId ?? "k1" })
    .setIssuer(options.issuer ?? TEAM)
    .setAudience(options.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(privateKey)

const carrying = (token: string) =>
  new Request("https://bt.example.test/api/me", { headers: { "cf-access-jwt-assertion": token } })

const viaJwt = async (token: string, settings: AccessSettings = SETTINGS) =>
  callerOf(carrying(token), undefined, settings, () => keys)

const stubAccess = (identity: CloudflareAccessIdentity | undefined): CloudflareAccessContext => ({
  aud: "bt-local",
  getIdentity: async () => identity,
})

describe("a caller vouched for by an Access JWT", () => {
  it("is a user, with the email lowercased so it matches the caregivers table", async () => {
    expect(await viaJwt(await sign({ email: "Andrew@Example.TEST", type: "app" }))).toEqual({
      kind: "user",
      email: "andrew@example.test",
    })
  })

  it("is a service, identified by its Client ID, for a service token", async () => {
    expect(await viaJwt(await sign({ common_name: "bt-admin.access", sub: "" }))).toEqual({
      kind: "service",
      clientId: "bt-admin.access",
    })
  })

  it.each([
    ["a list, as in a user's token", [AUD]],
    ["a string, as in a service token's", AUD],
  ])("accepts the AUD tag as %s", async (_label, audience) => {
    expect(await viaJwt(await sign({ email: "emily@example.test" }, { audience }))).toEqual({
      kind: "user",
      email: "emily@example.test",
    })
  })

  it.each([
    ["another app's audience", { audience: "another-app" }],
    ["another team's issuer", { issuer: "https://evil.cloudflareaccess.com" }],
    ["an expired token", { expiresIn: "-1m" }],
    ["a key that isn't in the team's key set", { keyId: "k2" }],
  ])("is unauthenticated for %s", async (_label, options) => {
    expect(await viaJwt(await sign({ email: "andrew@example.test" }, options))).toEqual({ kind: "unauthenticated" })
  })

  it("is unauthenticated for an unsigned token", async () => {
    const unsigned = new UnsecuredJWT({ email: "andrew@example.test" }).setIssuer(TEAM).setAudience(AUD).encode()
    expect(await viaJwt(unsigned)).toEqual({ kind: "unauthenticated" })
  })

  it("is unauthenticated for a token signed with a shared secret instead of the team's key", async () => {
    const hs256 = await new SignJWT({ email: "andrew@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a secret anyone could pick"))
    expect(await viaJwt(hs256)).toEqual({ kind: "unauthenticated" })
  })

  it("is unauthenticated for a token whose payload was swapped after signing", async () => {
    const [header, , signature] = (await sign({ email: "emily@example.test" })).split(".")
    const payload = btoa(JSON.stringify({ email: "intruder@example.test", iss: TEAM, aud: AUD, exp: 9e9 }))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
    expect(await viaJwt(`${header}.${payload}.${signature}`)).toEqual({ kind: "unauthenticated" })
  })

  it.each([
    ["no email or Client ID", {}],
    ["an empty email", { email: "" }],
    ["an email that isn't a string", { email: 42 }],
  ])("is unauthenticated for a valid token carrying %s", async (_label, claims) => {
    expect(await viaJwt(await sign(claims))).toEqual({ kind: "unauthenticated" })
  })

  it("is unauthenticated when the request carries no token", async () => {
    expect(await callerOf(new Request("https://bt.example.test/api/me"), undefined, SETTINGS, () => keys)).toEqual({
      kind: "unauthenticated",
    })
  })
})

describe("Access settings that can't verify a token", () => {
  it.each([
    ["the AUD tag is missing", { ACCESS_TEAM_DOMAIN: TEAM }],
    ["the AUD tag is empty", { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: "" }],
    ["the team domain is missing", { ACCESS_AUD: AUD }],
    ["the team domain is empty", { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: AUD }],
    ["the team domain has a trailing slash", { ACCESS_TEAM_DOMAIN: `${TEAM}/`, ACCESS_AUD: AUD }],
    ["the team domain isn't a URL", { ACCESS_TEAM_DOMAIN: "bt-test", ACCESS_AUD: AUD }],
  ])("refuse every token when %s, rather than skip that check", async (_label, settings) => {
    const anotherApp = await sign({ email: "andrew@example.test" }, { audience: "another-app" })
    expect(await viaJwt(anotherApp, settings)).toEqual({ kind: "unauthenticated" })
    expect(await viaJwt(await sign({ email: "andrew@example.test" }), settings)).toEqual({ kind: "unauthenticated" })
  })
})

describe("Cloudflare's signing keys out of reach", () => {
  it.each([
    ["the network fails", new TypeError("Network connection lost")],
    ["the request times out", new errors.JWKSTimeout()],
    [
      "Cloudflare answers with an error",
      new errors.JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response"),
    ],
  ])("makes the caller keys-unavailable, not unauthenticated, when %s", async (_label, failure) => {
    const token = await sign({ email: "andrew@example.test" })
    const unreachable = () => () => Promise.reject(failure)
    expect(await callerOf(carrying(token), undefined, SETTINGS, unreachable)).toEqual({ kind: "keys-unavailable" })
  })
})

describe("a caller vouched for by ctx.access (vite dev and vite preview)", () => {
  it("is taken from ctx.access, ahead of any JWT and whatever the settings", async () => {
    const caller = await callerOf(carrying("not a token"), stubAccess({ email: "Andrew@Example.test" }), {}, () => keys)
    expect(caller).toEqual({ kind: "user", email: "andrew@example.test" })
  })

  it("falls back to the JWT when ctx.access has no identity", async () => {
    const token = await sign({ email: "emily@example.test" })
    expect(await callerOf(carrying(token), stubAccess(undefined), SETTINGS, () => keys)).toEqual({
      kind: "user",
      email: "emily@example.test",
    })
  })

  it("is unauthenticated when the identity has no email or Client ID", async () => {
    const caller = await callerOf(
      new Request("https://bt.example.test/api/me"),
      stubAccess({ name: "Nobody" }),
      {},
      () => keys,
    )
    expect(caller).toEqual({ kind: "unauthenticated" })
  })
})
