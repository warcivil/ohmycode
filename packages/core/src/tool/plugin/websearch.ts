export * as WebSearchTool from "./websearch.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { ToolFailure } from "@opencode/ai"
import { Effect, Schema } from "effect"
import { HttpClientError } from "effect/unstable/http"
import { Permission } from "../../permission.js"
import { LoginRequired } from "../../plugin/websearch/lama.js"
import { WebSearch } from "../../websearch.js"
import { SearchInput } from "@opencode/schema/websearch"

export const name = "websearch"
export const NO_RESULTS = "No search results found. Please try a different query."
const httpErrors = new Map([
  [429, "Web search rate limited (HTTP 429)"],
  [401, "Подключите аккаунт OhMyLama через /connect (HTTP 401)"],
  [402, "Недостаточно средств на балансе OhMyLama для веб-поиска (HTTP 402)"],
])

export const description = `Search the web using the built-in OhMyLama search. Use this for current information beyond knowledge cutoff.
Use pro for research and best ranking, realtime for fast lookups. Describe the desired information in natural language. For recent news, use published_after (for example 7d); realtime alone is not a recency filter. Use site or exclude_domains to control sources. Read and compare result snippets, cite their URLs, and use webfetch when you need the full page. Do not treat search excerpts as complete documents or assume results are relevant just because the search succeeded.

The current year is ${new Date().getFullYear()}. Use this year when searching for recent information or current events.`

export const Input = SearchInput

const Output = Schema.Struct({
  provider: WebSearch.ID,
  results: Schema.Array(WebSearch.Result),
})
export const Plugin = {
  id: "opencode.tool.websearch",
  effect: Effect.fn("WebSearchTool.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service
    const websearch = yield* WebSearch.Service

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission.assert({
                action: name,
                resources: [input.query],
                save: ["*"],
                metadata: input,
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
              })
              const search = (providerID?: WebSearch.ID) =>
                websearch.query(
                  { ...input, providerID },
                  {
                    sessionID: context.sessionID,
                    onProvider: (provider) => context.progress({ provider: provider.id }),
                  },
                )
              const result = yield* search()
              const output = {
                provider: result.providerID,
                results: result.results,
              }
              const content = output.results.length
                ? output.results
                    .map((result) => {
                      const title = result.title ?? result.url
                      const published = result.time.published
                        ? `\nPublished: ${new Date(result.time.published).toISOString()}`
                        : ""
                      return `## [${title}](${result.url})${published}${result.content ? `\n\n${result.content}` : ""}`
                    })
                    .join("\n\n")
                : NO_RESULTS
              return { output, content, metadata: { provider: output.provider } }
            }).pipe(
              Effect.mapError((error) => {
                const fallback = `Unable to search the web for ${input.query}`
                if (!Schema.is(WebSearch.RequestError)(error)) return new ToolFailure({ message: fallback, error })
                if (Schema.is(LoginRequired)(error.cause))
                  return new ToolFailure({
                    message: "Для веб-поиска подключите аккаунт OhMyLama через /connect.",
                    error,
                  })
                const status = HttpClientError.isHttpClientError(error.cause) ? error.cause.response?.status : undefined
                return new ToolFailure({
                  message:
                    status === undefined
                      ? fallback
                      : (httpErrors.get(status) ?? `Web search request failed (HTTP ${status})`),
                  error,
                  metadata: { provider: error.providerID },
                })
              }),
            ),
        }),
      )
      .pipe(Effect.orDie)

    const hook = (event: SessionHooks["context"]) =>
      Effect.gen(function* () {
        const disabled = yield* websearch.default().pipe(
          Effect.as(false),
          Effect.catchTag("WebSearch.Disabled", () => Effect.succeed(true)),
        )
        if (disabled) delete event.tools[name]
      })
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)
  }),
}
