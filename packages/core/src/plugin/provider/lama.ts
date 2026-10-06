import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { Money } from "@opencode/schema/money"
import catalog from "./lama-catalog.js"

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

export function lamaModels() {
  const prices: Record<string, number[]> = catalog.prices
  return catalog.models.map((id) => {
    const prefix = Object.keys(prices)
      .filter((key) => id.startsWith(key))
      .sort((a, b) => b.length - a.length)[0]
    const price = prices[prefix]
    const usd = Money.USDPerMillionTokens.make
    return {
      ...Model.Info.default(providerID, Model.ID.make(id)),
      name: id,
      limit: { context: 131072, output: 16384 },
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
        models: lamaModels(),
      })
    })
  }),
})
