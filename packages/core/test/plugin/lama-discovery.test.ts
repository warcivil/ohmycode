import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createLamaDiscovery, decodeLamaCatalog } from "@opencode/core/plugin/provider/lama-discovery"
import { lamaModels } from "@opencode/core/plugin/provider/lama"

const model = {
  id: "new-model",
  name: "New model",
  status: "active",
  input: ["text", "image"],
  output: ["text"],
  tools: true,
  reasoning: { supported: true, effort: ["low", "high"] },
  files: { text: "tools", native: ["image"] },
  limits: { context: 200000, output: 32000 },
  pricing: { currency: "USD", unit: "million_tokens", input: 1, output: 3, cache_read: 0.1, cache_write: 1 },
}
const snapshot = { schema_version: 1, revision: "a".repeat(64), models: [model] }

test("catalog survives offline, invalid data and removals, and honors ETag", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lama-catalog-"))
  const file = path.join(directory, "models.json")
  const state = { body: snapshot, status: 200, etag: "" }
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      state.etag = request.headers.get("if-none-match") ?? ""
      if (state.status !== 200) return new Response(null, { status: state.status })
      return Response.json(state.body)
    },
  })
  try {
    const discovery = createLamaDiscovery(file, server.url.href)
    expect(await discovery.read()).toBeUndefined()
    const first = await discovery.refresh()
    expect(lamaModels(first)[0]).toMatchObject({
      id: "new-model",
      capabilities: { input: ["text", "image"], tools: true, reasoning: true },
      variants: [
        { id: "low", settings: { reasoningEffort: "low" } },
        { id: "high", settings: { reasoningEffort: "high" } },
      ],
    })
    state.status = 304
    expect(await discovery.refresh()).toBeUndefined()
    expect(state.etag).toBe(`"${snapshot.revision}"`)
    state.status = 503
    await expect(discovery.refresh()).rejects.toThrow("503")
    state.status = 200
    state.body = { ...snapshot, models: [] }
    await expect(discovery.refresh()).rejects.toThrow()
    expect(await discovery.read()).toEqual(decodeLamaCatalog(snapshot))
    state.body = {
      ...snapshot,
      revision: "b".repeat(64),
      models: [{ ...model, id: "replacement", input: ["text"], files: { text: "tools", native: [] } }],
    }
    const next = await discovery.refresh()
    expect(next?.models.map((m) => [m.id, m.status])).toEqual([
      ["replacement", "active"],
      ["new-model", "deprecated"],
    ])
    const restarted = createLamaDiscovery(file, server.url.href)
    expect(await restarted.read()).toEqual(next)
    expect(lamaModels(next)[0].capabilities.input).toEqual(["text"])
    await Bun.write(file, "broken json")
    expect(await restarted.read()).toBeUndefined()
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
})

test("catalog rejects unsupported schema, duplicates and contradictory capabilities", () => {
  for (const value of [
    { ...snapshot, schema_version: 2 },
    { ...snapshot, models: [model, model] },
    { ...snapshot, models: [{ ...model, input: ["text"] }] },
    { ...snapshot, models: [{ ...model, reasoning: { supported: false, effort: ["high"] } }] },
    { ...snapshot, models: [{ ...model, pricing: { ...model.pricing, input: -1 } }] },
  ])
    expect(() => decodeLamaCatalog(value)).toThrow()
})
