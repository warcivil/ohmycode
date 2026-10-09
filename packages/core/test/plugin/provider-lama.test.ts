import { Rpc } from "@opencode/core/rpc"
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
  expect(models.every((m) => m.capabilities.tools)).toBe(true)
  expect(models.find((m) => m.id === "glm-5.3")?.capabilities.reasoning).toBe(true)
  expect(models.find((m) => m.id === "qwen3.8-max")?.capabilities.reasoning).toBe(true)
  for (const [id, image] of [
    ["gpt-6.1-sol", true],
    ["claude-haiku-5.5", true],
    ["qwen3.8-max", true],
    ["glm-5.3", false],
    ["glm-5.3-flash", true],
    ["glm-5.2", false],
    ["deepseek-v4-pro", false],
    ["deepseek-v4.1-flash", true],
    ["minimax-m2.5", false],
    ["minimax-m3", true],
  ] as const) {
    expect(models.find((m) => m.id === id)?.capabilities.input.includes("image")).toBe(image)
  }
  for (const id of ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "claude-haiku-5.5"]) {
    expect(models.some((m) => m.id === id)).toBe(true)
  }
  expect(models.every((m) => m.cost.length > 0 && m.cost[0].input > 0 && m.cost[0].output > 0)).toBe(true)
})

test("LAMA exposes selectable reasoning effort only for supported models", () => {
  const models = lamaModels()
  for (const [id, expected] of [
    ["gpt-6.1-sol", ["low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-luna", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["claude-sonnet-5.5", ["low", "medium", "high", "xhigh", "max"]],
    ["claude-sonnet-4.6", ["low", "medium", "high", "max"]],
    ["claude-haiku-4.5", []],
    ["gemini-3.8-flash", ["low", "medium", "high"]],
    ["grok-4.7", ["low", "medium", "high", "xhigh"]],
    ["glm-5.3", ["low", "high", "max"]],
    ["glm-5.2", ["high", "max"]],
    ["kimi-k3", ["low", "high", "max"]],
    ["deepseek-v4.1-flash", ["none", "low", "high", "max"]],
    ["qwen3.8-max", []],
    ["minimax-m3", []],
    ["minimax-m2.7", []],
  ] as const) {
    const variants = models.find((model) => model.id === id)?.variants
    expect(variants?.map((variant) => String(variant.id))).toEqual([...expected])
    expect(variants?.map((variant) => variant.settings?.reasoningEffort)).toEqual([...expected])
  }
})

test("LAMA exposes manufacturer windows separately from the compaction threshold", () => {
  const models = lamaModels()
  expect(models.every((model) => model.limit.context > 0 && model.limit.output > 0)).toBe(true)
  for (const [id, context, output] of [
    ["gpt-6.1-sol", 1_050_000, 128_000],
    ["claude-opus-5.5", 1_000_000, 128_000],
    ["claude-haiku-4.5", 200_000, 64_000],
    ["grok-4.7", 500_000, 500_000],
    ["gemini-3.8-flash", 1_048_576, 65_536],
    ["minimax-m2.5", 196_608, 204_800],
  ] as const) {
    expect(models.find((model) => model.id === id)?.limit).toMatchObject({ context, output })
  }
})

it.live("website login stores the issued key as a native credential", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const original = globalThis.fetch
      const calls: string[] = []
      globalThis.fetch = Object.assign(
        async (input: string | URL | Request) => {
          const url = String(input)
          if (url.endsWith("/api/models/desktop")) return new Response(null, { status: 503 })
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
        const result = yield* integrations.oauth.status({ integrationID, attemptID: attempt.attemptID }).pipe(
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

it.live("account RPC uses the active credential and never returns its secret", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const original = globalThis.fetch
      const authorization: string[] = []
      const replies = [
        Response.json({ balance: "12.34", currency: "RUB" }),
        Response.json({ balance: "0.00", currency: "RUB" }),
        new Response(null, { status: 401 }),
        new Response(null, { status: 503 }),
      ]
      globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          if (String(input).endsWith("/api/models/desktop")) return new Response(null, { status: 503 })
          expect(String(input)).toBe("https://ohmylama.ru/v1/account")
          authorization.push(new Headers(init?.headers).get("Authorization") ?? "")
          return replies.shift() ?? new Response(null, { status: 500 })
        },
        { preconnect: original.preconnect },
      )
      return { original, authorization }
    }),
    ({ authorization }) =>
      Effect.gen(function* () {
        const plugin = yield* Plugin.Service
        yield* LamaPlugin.effect(yield* PluginHost.make(plugin))
        const rpc = yield* Rpc.Service
        const credentials = yield* Credential.Service
        const first = yield* credentials.create({
          integrationID,
          label: "first",
          value: Credential.Key.make({ type: "key", key: "sk-lama-first" }),
        })
        expect(yield* rpc.call("ohmycode.account", "get", {})).toEqual({
          status: "ready",
          balance: 12.34,
          currency: "RUB",
        })
        yield* credentials.create({
          integrationID,
          label: "second",
          value: Credential.OAuth.make({
            type: "oauth",
            methodID,
            access: "sk-lama-second",
            refresh: "",
            expires: 8640000000000000,
          }),
        })
        expect(yield* rpc.call("ohmycode.account", "get", {})).toEqual({ status: "ready", balance: 0, currency: "RUB" })
        yield* credentials.activate(first.id)
        expect(yield* rpc.call("ohmycode.account", "get", {})).toEqual({ status: "invalid-key" })
        expect(yield* rpc.call("ohmycode.account", "get", {})).toEqual({ status: "unavailable" })
        expect(authorization).toEqual([
          "Bearer sk-lama-first",
          "Bearer sk-lama-second",
          "Bearer sk-lama-first",
          "Bearer sk-lama-first",
        ])
      }),
    ({ original }) =>
      Effect.sync(() => {
        globalThis.fetch = original
      }),
  ),
)
