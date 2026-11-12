import { beforeEach, describe, expect } from "bun:test"
import { Effect } from "effect"
import { bindDeviceKey, devicePublicKey } from "@opencode/core/plugin/provider/lama-device"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { WebSearch } from "@opencode/core/websearch"
import { WebSearchLama } from "@opencode/core/plugin/websearch/lama"
import { host, webSearchHost } from "./host"
import { requests, resetWebSearchFixture, webSearchIntegrationTest as it } from "./websearch-fixture"

beforeEach(async () => {
  await devicePublicKey()
  await bindDeviceKey("test-lama-key")
})

beforeEach(() =>
  resetWebSearchFixture(
    JSON.stringify({ results: [{ title: "Docs", url: "https://example.com", snippet: "Documentation" }] }),
  ),
)
describe("OhMyLama native search", () => {
  it.effect("uses connected credentials without a provider picker", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const search = yield* WebSearch.Service
      yield* credentials.create({
        integrationID: Integration.ID.make("ohmylama"),
        value: { type: "key", key: "test-lama-key" },
      })
      yield* WebSearchLama.Plugin.effect(host({ websearch: webSearchHost(search) }))
      const result = yield* search.query({ query: "documentation" })
      expect(result.providerID).toBe(WebSearch.ID.make("ohmylama"))
      expect(result.results[0]?.content).toBe("Documentation")
      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers["x-ohmycode-signature"]).toBeTruthy()
      expect(requests[0]?.url).toBe("https://ohmylama.ru/v1/web/search")
      expect(requests[0]?.headers.authorization).toBe("Bearer test-lama-key")
      expect(requests[0]?.body).toEqual({
        query: "documentation",
        mode: "pro",
        max_results: 8,
        snippet_max_length: 3500,
      })
    }),
  )
  it.effect("does not bypass a balance error", () =>
    Effect.gen(function* () {
      resetWebSearchFixture("{}", 402)
      const credentials = yield* Credential.Service
      const search = yield* WebSearch.Service
      yield* credentials.create({
        integrationID: Integration.ID.make("ohmylama"),
        value: { type: "key", key: "test-lama-key" },
      })
      yield* WebSearchLama.Plugin.effect(host({ websearch: webSearchHost(search) }))
      expect(yield* search.query({ query: "documentation" }).pipe(Effect.flip)).toBeInstanceOf(WebSearch.RequestError)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers["x-ohmycode-signature"]).toBeTruthy()
    }),
  )
  it.effect("forwards native options and retains publication dates", () =>
    Effect.gen(function* () {
      resetWebSearchFixture(
        JSON.stringify({
          results: [
            { title: "Docs", url: "https://example.com", snippet: "Excerpt", published_at: "2026-11-01T00:00:00Z" },
          ],
        }),
      )
      const credentials = yield* Credential.Service
      const search = yield* WebSearch.Service
      yield* credentials.create({
        integrationID: Integration.ID.make("ohmylama"),
        value: { type: "key", key: "test-lama-key" },
      })
      yield* WebSearchLama.Plugin.effect(host({ websearch: webSearchHost(search) }))
      const options = {
        query: "Python updates",
        mode: "realtime" as const,
        max_results: 3,
        snippet_max_length: 6000,
        site: "python.org",
        exclude_domains: ["example.com"],
        published_after: "7d",
        published_before: "2026-11-12",
        acquired_after: "1mo",
        acquired_before: "2026-11-12",
      }
      const result = yield* search.query({ ...options, providerID: WebSearch.ID.make("ohmylama") })
      expect(requests[0]?.body).toEqual(options)
      expect(result.results[0]?.time.published).toBe(Date.parse("2026-11-01T00:00:00Z"))
    }),
  )
})
