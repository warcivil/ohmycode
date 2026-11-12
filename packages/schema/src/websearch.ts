export * as WebSearch from "./websearch.js"

import { Schema } from "effect"
import { ephemeral, inventory } from "./event.js"
import { optional } from "./schema.js"

export const ID = Schema.String.pipe(Schema.brand("WebSearch.ID"))
export type ID = typeof ID.Type

export interface Provider extends Schema.Schema.Type<typeof Provider> {}
export const Provider = Schema.Struct({
  id: ID,
  name: Schema.String,
}).annotate({ identifier: "WebSearch.Provider" })

const DateFilter = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)).annotate({
  description: "ISO date (2026-11-01), ISO timestamp, or relative duration (7d, 2w, 1mo).",
})

export const SearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(400)).annotate({
    description:
      "Describe the information or page you need in natural language. Supports quoted phrases, site: domains, and -excluded terms.",
  }),
  mode: Schema.optional(Schema.Literals(["pro", "realtime"])).annotate({
    description:
      "pro (default) for deeper retrieval and best ranking; realtime for fast lookups. Neither guarantees a publication date.",
  }),
  max_results: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
  ).annotate({ description: "Maximum results, 1–50; default 8." }),
  snippet_max_length: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 180, maximum: 10000 })),
  ).annotate({
    description: "Characters per result snippet, 180–10000; default 3500. Snippets are excerpts, not full pages.",
  }),
  site: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048))).annotate({
    description: "Restrict to one domain or domain/path. For multiple domains, use site: operators in query.",
  }),
  exclude_domains: Schema.optional(Schema.Array(Schema.String).check(Schema.isMaxLength(150))).annotate({
    description: "Exclude hosts and their subdomains. Hostnames only, no paths or wildcards.",
  }),
  published_after: Schema.optional(DateFilter).annotate({
    description:
      "Keep pages published on/after this date; 7d means the last 7 days. Excludes pages with unknown publication dates.",
  }),
  published_before: Schema.optional(DateFilter),
  acquired_after: Schema.optional(DateFilter).annotate({
    description: "Filter when pages entered the search index, not when they were published.",
  }),
  acquired_before: Schema.optional(DateFilter),
})
export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({
  ...SearchInput.fields,
  providerID: ID.pipe(optional),
}).annotate({ identifier: "WebSearch.Input" })
export type ProviderInput = typeof SearchInput.Type

export interface Result extends Schema.Schema.Type<typeof Result> {}
export const Result = Schema.Struct({
  url: Schema.String,
  title: Schema.String.pipe(optional),
  content: Schema.String.pipe(optional),
  time: Schema.Struct({
    published: Schema.Finite.pipe(optional).annotate({
      description: "Publication time in milliseconds since the Unix epoch",
    }),
  }),
}).annotate({ identifier: "WebSearch.Result" })

export class Response extends Schema.Class<Response>("WebSearch.Response")({
  providerID: ID,
  results: Schema.Array(Result),
}) {}

const Updated = ephemeral({
  type: "websearch.updated",
  schema: {},
})
export const Event = { Updated, Definitions: inventory(Updated) }
