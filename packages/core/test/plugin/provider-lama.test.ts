import { expect, test } from "bun:test"
import { Effect, Schedule } from "effect"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { LamaPlugin, lamaModels } from "@opencode/core/plugin/provider/lama"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const integrationID = Integration.ID.make("ohmylama")
const methodID = Integration.MethodID.make("lama-device")

test("LAMA catalog includes images, tools, Grok, and retail costs", () => {
  const models = lamaModels()
  expect(models.some((m) => m.id === "grok-4.7")).toBe(true)
  expect(models.every((m) => m.capabilities.tools && m.capabilities.input.includes("image"))).toBe(true)
  expect(models.every((m) => m.cost.length > 0 && m.cost[0].input > 0 && m.cost[0].output > 0)).toBe(true)
})

it.live("website login stores the issued key as a native credential", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const original = globalThis.fetch
      const calls: string[] = []
      globalThis.fetch = Object.assign(
        async (input: string | URL | Request) => {
          const url = String(input)
          calls.push(url)
          if (url.endsWith("/start"))
            return Response.json({
              device_code: "a".repeat(43),
              verification_uri: "https://ohmylama.ru/desktop/connect#code=" + "b".repeat(43),
              user_code: "ABC123",
              expires_in: 600,
            })
          if (url.endsWith("/token")) return Response.json({ api_key: "sk-lama-testcredential" })
          throw new Error("Unexpected login endpoint")
        },
        { preconnect: original.preconnect },
      )
      return { original, calls }
    }),
    ({ calls }) =>
      Effect.gen(function* () {
        const plugin = yield* Plugin.Service
        yield* LamaPlugin.effect(yield* PluginHost.make(plugin))
        const integrations = yield* Integration.Service
        const attempt = yield* integrations.oauth.connect({ integrationID, methodID })
        expect(attempt.url).toStartWith("https://ohmylama.ru/desktop/connect#code=")
        const result = yield* integrations.oauth
          .status({ integrationID, attemptID: attempt.attemptID })
          .pipe(
            Effect.repeat({
              until: (value) => value.status !== "pending",
              schedule: Schedule.spaced("100 millis"),
              times: 60,
            }),
          )
        expect(result.status).toBe("complete")
        const credentials = yield* Credential.Service
        const saved = yield* credentials.list(integrationID)
        expect(saved[0].value).toMatchObject({ type: "oauth", access: "sk-lama-testcredential" })
        expect(calls).toEqual([
          "https://ohmylama.ru/api/desktop-auth/start",
          "https://ohmylama.ru/api/desktop-auth/token",
        ])
      }),
    ({ original }) =>
      Effect.sync(() => {
        globalThis.fetch = original
      }),
  ),
)
