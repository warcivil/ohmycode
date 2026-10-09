import { Schema } from "effect"
import { mkdir, rename } from "node:fs/promises"
import path from "node:path"

const positive = Schema.Int.check(Schema.isGreaterThan(0))
const price = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isFinite())
const modality = Schema.Literals(["text", "image", "pdf", "audio", "video"])
const definition = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/)),
  name: Schema.String,
  status: Schema.Literals(["active", "deprecated"]),
  input: Schema.Array(modality),
  output: Schema.Array(Schema.Literal("text")),
  tools: Schema.Boolean,
  reasoning: Schema.Struct({
    supported: Schema.Boolean,
    effort: Schema.Array(Schema.Literals(["none", "minimal", "low", "medium", "high", "xhigh", "max"])),
  }),
  files: Schema.Struct({ text: Schema.Literals(["tools", "unsupported"]), native: Schema.Array(modality) }),
  limits: Schema.Struct({ context: positive, output: positive, input: Schema.optional(positive) }),
  pricing: Schema.Struct({
    currency: Schema.Literal("USD"),
    unit: Schema.Literal("million_tokens"),
    input: price,
    output: price,
    cache_read: price,
    cache_write: price,
  }),
})

const envelope = Schema.Struct({
  schema_version: Schema.Literal(1),
  revision: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  models: Schema.Array(definition).check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
})
export type LamaCatalog = typeof envelope.Type

export function decodeLamaCatalog(value: unknown) {
  const result = Schema.decodeUnknownSync(envelope)(value)
  if (new Set(result.models.map((m) => m.id)).size !== result.models.length) throw new Error("Duplicate LAMA model")
  for (const model of result.models) {
    if (!model.input.includes("text") || !model.output.includes("text")) throw new Error("Missing text modality")
    if (!model.reasoning.supported && model.reasoning.effort.length) throw new Error("Invalid reasoning controls")
    if (model.files.native.some((kind) => !model.input.includes(kind))) throw new Error("Invalid file modality")
  }
  return result
}

// Failed reads/requests leave the caller's in-memory catalog untouched.
export function createLamaDiscovery(file: string, endpoint = "https://ohmylama.ru/api/models/desktop") {
  const state = { revision: "", catalog: undefined as LamaCatalog | undefined }
  return {
    async read() {
      state.catalog = await Bun.file(file)
        .json()
        .then(decodeLamaCatalog)
        .catch(() => undefined)
      state.revision = state.catalog?.revision ?? ""
      return state.catalog
    },
    async refresh() {
      const response = await fetch(endpoint, {
        headers: state.revision ? { "If-None-Match": `"${state.revision}"` } : {},
        signal: AbortSignal.timeout(5000),
      })
      if (response.status === 304) return
      if (!response.ok) throw new Error(`LAMA catalog HTTP ${response.status}`)
      const remote = decodeLamaCatalog(await response.json())
      const ids = new Set(remote.models.map((model) => model.id))
      const catalog: LamaCatalog = {
        ...remote,
        models: [
          ...remote.models,
          ...(state.catalog?.models ?? [])
            .filter((model) => !ids.has(model.id))
            .map((model) => ({
              ...model,
              status: "deprecated" as const,
            })),
        ],
      }
      // Persist before swapping so a broken response never replaces a working cache.
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.${crypto.randomUUID()}.tmp`
      await Bun.write(temporary, JSON.stringify(catalog))
      await rename(temporary, file)
      state.revision = catalog.revision
      state.catalog = catalog
      return catalog
    },
  }
}
