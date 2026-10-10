import { LamaAccountRpc } from "@opencode/schema/lama-account"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schema, Schedule } from "effect"
import { Path } from "@opencode/util/global"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { Money } from "@opencode/schema/money"
import catalog from "./lama-catalog.js"
import { createLamaDiscovery, type LamaCatalog } from "./lama-discovery.js"

const providerID = Provider.ID.make("ohmylama")
const methodID = Integration.MethodID.make("lama-device")
const root = "https://ohmylama.ru"
const Device = Schema.Struct({
  device_code: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  verification_uri: Schema.String.check(
    Schema.isPattern(/^https:\/\/ohmylama\.ru\/desktop\/connect#code=[A-Za-z0-9_-]{43}$/),
  ),
  user_code: Schema.String.check(Schema.isPattern(/^[A-F0-9]{6}$/)),
  expires_in: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(600)),
})
const Token = Schema.Struct({ api_key: Schema.String.check(Schema.isPattern(/^sk-lama-[a-zA-Z0-9]+$/)) })

export function lamaModels(remote?: LamaCatalog): Model.Info[] {
  if (remote)
    return remote.models.map((item) => ({
      ...Model.Info.default(providerID, Model.ID.make(item.id)),
      name: item.name,
      status: item.status,
      capabilities: {
        tools: item.tools,
        reasoning: item.reasoning.supported,
        input: [...item.input],
        output: [...item.output],
      },
      variants: item.reasoning.effort.map((effort) => ({
        id: Model.VariantID.make(effort),
        settings: { reasoningEffort: effort },
      })),
      limit: { ...item.limits },
      cost: [
        {
          input: Money.USDPerMillionTokens.make(item.pricing.input),
          output: Money.USDPerMillionTokens.make(item.pricing.output),
          cache: {
            read: Money.USDPerMillionTokens.make(item.pricing.cache_read),
            write: Money.USDPerMillionTokens.make(item.pricing.cache_write),
          },
        },
      ],
    }))
  const prices: Record<string, number[]> = catalog.prices
  const limits: Record<string, Model.Info["limit"]> = catalog.limits
  const features: Record<string, { image: boolean; tools: boolean; reasoning: boolean; effort: string[] }> =
    catalog.features
  return catalog.models.map((id) => {
    const prefix = Object.keys(prices)
      .filter((key) => id.startsWith(key))
      .sort((a, b) => b.length - a.length)[0]
    const price = prices[prefix]
    const usd = Money.USDPerMillionTokens.make
    return {
      ...Model.Info.default(providerID, Model.ID.make(id)),
      name: id,
      capabilities: {
        tools: features[id].tools,
        reasoning: features[id].reasoning,
        input: features[id].image ? ["text", "image"] : ["text"],
        output: ["text"],
      },
      variants: features[id].effort.map((effort) => ({
        id: Model.VariantID.make(effort),
        settings: { reasoningEffort: effort },
      })),
      limit: { ...limits[id] },
      cost: price
        ? [
            {
              input: usd(price[0]),
              output: usd(price[1]),
              cache: { read: usd(price[2] ?? price[0]), write: usd(price[3] ?? price[0]) },
            },
          ]
        : [],
    }
  })
}

export const LamaPlugin = define({
  id: "ohmycode.provider.lama",
  effect: Effect.fn(function* (ctx) {
    const credentials = yield* Credential.Service
    const discovery = createLamaDiscovery(path.join(Path.cache, "lama-models-v1.json"))
    const cached = yield* Effect.promise(() => discovery.read())
    const inventory = { models: mergeLamaModels(lamaModels(), cached), revision: cached?.revision }
    yield* ctx.rpc
      .register(LamaAccountRpc, {
        transcribe: (input) => Effect.gen(function* () {
          const saved = (yield* credentials.list(Integration.ID.make(providerID))).at(-1)?.value
          const key = saved?.type === "key" ? saved.key : saved?.type === "oauth" ? saved.access : process.env.LAMA_API_KEY

          if (!key) return { text: "", error: "Подключите аккаунт LAMA для распознавания голосовых." }
          return yield* Effect.tryPromise(async (signal) => {
            if (!process.env.XDG_DATA_HOME) throw new Error("Desktop storage unavailable")
            const directory = await realpath(path.join(process.env.XDG_DATA_HOME, "opencode", "telegram-inbox"))
            const file = await realpath(input.file)
            const relative = path.relative(directory, file)

            if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid voice attachment")
            const info = await stat(file)

            if (!info.isFile() || info.size > 20_000_000) throw new Error("Invalid voice attachment size")
            const form = new FormData()
            form.set("model", "nova-2")
            form.set("file", new Blob([await readFile(file)], { type: "audio/ogg" }), "voice.ogg")
            const response = await fetch(`${root}/v1/audio/transcriptions`, {
              method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
              signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]), redirect: "error",
            })

            if (!response.ok) return { text: "", error: "Не удалось распознать голосовое. Проверьте API-баланс и повторите попытку." }

            return Schema.decodeUnknownSync(Schema.Struct({ text: Schema.String }))(await response.json())
          })
        }).pipe(Effect.catch(() => Effect.succeed({ text: "", error: "Сервис распознавания временно недоступен. Отправьте задачу текстом или повторите голосовое." }))),
        get: () =>
          Effect.gen(function* () {
            const saved = (yield* credentials.list(Integration.ID.make(providerID))).at(-1)?.value
            const key =
              saved?.type === "key" ? saved.key : saved?.type === "oauth" ? saved.access : process.env.LAMA_API_KEY
            if (!key) return { status: "disconnected" as const }
            const response = yield* Effect.tryPromise(() =>
              fetch(`${root}/v1/account`, {
                headers: { Authorization: `Bearer ${key}` },
                signal: AbortSignal.timeout(10_000),
              }),
            )
            if (response.status === 401) return { status: "invalid-key" as const }
            if (response.status === 403) return { status: "blocked" as const }
            if (!response.ok) return { status: "unavailable" as const }
            const data = yield* Effect.tryPromise(() => response.json()).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Struct({
                    balance: Schema.NumberFromString,
                    currency: Schema.Literal("RUB"),
                  }),
                ),
              ),
            )
            if (!Number.isFinite(data.balance)) return { status: "unavailable" as const }
            return { status: "ready" as const, ...data }
          }).pipe(Effect.catch(() => Effect.succeed({ status: "unavailable" as const }))),
      })
      .pipe(Effect.orDie)
    yield* ctx.integration.transform((editor) => {
      for (const integration of editor.list()) if (integration.id !== providerID) editor.remove(integration.id)
      editor.update(providerID, (integration) => {
        integration.name = "LAMA"
      })
      editor.method.update({ integrationID: providerID, method: { type: "env", names: ["LAMA_API_KEY"] } })
      editor.method.update({
        integrationID: providerID,
        method: { id: methodID, type: "oauth", label: "Войти через ohmylama.ru" },
        refresh: (value) => Effect.succeed(value),
        authorize: () =>
          Effect.gen(function* () {
            const response = yield* Effect.tryPromise(() =>
              fetch(`${root}/api/desktop-auth/start`, { method: "POST", signal: AbortSignal.timeout(15000) }),
            )
            if (!response.ok) return yield* Effect.fail(new Error(`LAMA login: HTTP ${response.status}`))
            const device = yield* Effect.tryPromise(() => response.json()).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Device)),
            )
            const expiresAt = Date.now() + device.expires_in * 1000
            return {
              mode: "auto" as const,
              url: device.verification_uri,
              instructions: `Подтвердите вход на ohmylama.ru. Код: ${device.user_code}`,
              expiresAt,
              callback: Effect.gen(function* () {
                while (Date.now() < expiresAt) {
                  yield* Effect.sleep("3 seconds")
                  const response = yield* Effect.tryPromise(() =>
                    fetch(`${root}/api/desktop-auth/token`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ device_code: device.device_code }),
                      signal: AbortSignal.timeout(15000),
                    }),
                  )
                  if (response.status === 202) continue
                  if (!response.ok) return yield* Effect.fail(new Error(`LAMA login: HTTP ${response.status}`))
                  const token = yield* Effect.tryPromise(() => response.json()).pipe(
                    Effect.flatMap(Schema.decodeUnknownEffect(Token)),
                  )
                  return Credential.OAuth.make({
                    type: "oauth",
                    methodID,
                    access: token.api_key,
                    refresh: "",
                    expires: 8_640_000_000_000_000,
                  })
                }
                return yield* Effect.fail(new Error("Ссылка истекла. Начните вход заново."))
              }),
            }
          }),
      })
      editor.method.update({ integrationID: providerID, method: { type: "key", label: "Ввести API-ключ LAMA" } })
    })
    yield* ctx.provider.transform((editor) => {
      for (const item of editor.list()) if (item.provider.id !== providerID) editor.remove(item.provider.id)
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: "LAMA",
          integrationID: Integration.ID.make(providerID),
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${root}/v1` },
        },
        models: inventory.models,
      })
    })
    const refresh = Effect.gen(function* () {
      const remote = yield* Effect.tryPromise(() => discovery.refresh())
      if (!remote || remote.revision === inventory.revision) return
      inventory.models = mergeLamaModels(inventory.models, remote)
      inventory.revision = remote.revision
      yield* ctx.provider.reload()
    })
    yield* refresh.pipe(Effect.ignore, Effect.repeat(Schedule.spaced("1 hour")), Effect.forkScoped)
  }),
})

function mergeLamaModels(previous: Model.Info[], remote?: LamaCatalog): Model.Info[] {
  if (!remote) return previous
  const models = lamaModels(remote)
  const ids = new Set(models.map((model) => model.id))
  // Retain definitions for old conversations without changing the user's selection.
  return [
    ...models,
    ...previous
      .filter((model) => !ids.has(model.id))
      .map((model) => ({
        ...model,
        status: "deprecated" as const,
      })),
  ]
}
