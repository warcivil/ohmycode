export * as WebSearchLama from "./lama.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Duration, Effect, Schema, Scope } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { SearchInput } from "@opencode/schema/websearch"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"

export class LoginRequired extends Schema.TaggedError<LoginRequired>()("OhMyLama.SearchLoginRequired", {}) {}

export const endpoint = "https://ohmylama.ru/v1/web/search"

const SearchResponse = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      snippet: Schema.String,
      published_at: Schema.optional(Schema.String),
      acquired_at: Schema.optional(Schema.String),
    }),
  ),
})

export const Plugin = define<HttpClient.HttpClient | Credential.Service | Scope.Scope>({
  id: "ohmylama.websearch",
  effect: Effect.fn("WebSearchLama.Plugin")(function* (ctx) {
    const http = yield* HttpClient.HttpClient
    const credentials = yield* Credential.Service
    yield* ctx.websearch.transform((editor) => {
      editor.add({
        id: "ohmylama",
        name: "OhMyLama",
        execute: (input) =>
          Effect.gen(function* () {
            const saved = (yield* credentials.list(Integration.ID.make("ohmylama"))).at(-1)?.value
            const key =
              saved?.type === "key" ? saved.key : saved?.type === "oauth" ? saved.access : process.env.LAMA_API_KEY
            if (!key) return yield* Effect.fail(new LoginRequired({}))
            const request = yield* HttpClientRequest.post(endpoint).pipe(
              HttpClientRequest.acceptJson,
              HttpClientRequest.setHeader("Authorization", `Bearer ${key}`),
              HttpClientRequest.schemaBodyJson(SearchInput)({
                ...input,
                mode: input.mode ?? "pro",
                max_results: input.max_results ?? 8,
                snippet_max_length: input.snippet_max_length ?? 3500,
              }),
            )
            const response = yield* HttpClient.withScope(HttpClient.filterStatusOk(http))
              .execute(request)
              .pipe(
                Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponse)),
                Effect.scoped,
                Effect.timeoutOrElse({
                  duration: Duration.seconds(25),
                  orElse: () => Effect.fail(new Error("Время ожидания веб-поиска истекло.")),
                }),
              )
            return response.results.map((item) => ({
              url: item.url,
              title: item.title,
              content: item.snippet,
              time:
                item.published_at && Number.isFinite(Date.parse(item.published_at))
                  ? { published: Date.parse(item.published_at) }
                  : {},
            }))
          }),
      })
      editor.default.set("ohmylama")
    })
  }),
})
