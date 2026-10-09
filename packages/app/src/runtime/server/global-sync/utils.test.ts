import { describe, expect, test } from "bun:test"
import type { AgentListOutput, ModelListOutput, Project, ProviderListOutput } from "@opencode/client/promise"
import { directoryKey, normalizeAgentList, normalizeProjectInfo, normalizeProviderList } from "./utils"

describe("normalizeAgentList", () => {
  test("adapts current agents to the app agent shape", () => {
    const result = normalizeAgentList([
      {
        id: "build",
        name: "Build",
        mode: "primary",
        hidden: false,
        color: "primary",
        model: { id: "gpt-5", providerID: "openai", variant: "high" },
        request: { settings: { temperature: 0.2, topP: 0.9 }, headers: {}, body: {} },
        system: "Build software",
        permissions: [{ action: "read", resource: "*", effect: "allow" }],
      },
    ] as AgentListOutput["data"])

    expect(result).toEqual([
      {
        name: "build",
        description: undefined,
        mode: "primary",
        hidden: false,
        temperature: 0.2,
        topP: 0.9,
        color: "primary",
        permission: [{ permission: "read", pattern: "*", action: "allow" }],
        model: { providerID: "openai", modelID: "gpt-5" },
        variant: "high",
        prompt: "Build software",
        options: { temperature: 0.2, topP: 0.9 },
        steps: undefined,
      },
    ])
  })
})

describe("normalizeProviderList", () => {
  test.each([true, false, undefined])(
    "preserves reasoning support %p independently of selectable modes",
    (reasoning) => {
      const result = normalizeProviderList(
        [{ id: "ohmylama", name: "LAMA" }] as ProviderListOutput["data"],
        [
          {
            id: "glm-5.3",
            modelID: "glm-5.3",
            enabled: true,
            providerID: "ohmylama",
            name: "GLM-5.3",
            time: { released: 0 },
            capabilities: { tools: true, reasoning, input: ["text"], output: ["text"] },
            variants: [],
            cost: [],
            status: "active",
            limit: { context: 1000000, output: 128000 },
          },
        ] as ModelListOutput["data"],
      )
      expect(result.all.get("ohmylama")?.models["glm-5.3"].capabilities.reasoning).toBe(reasoning ?? false)
    },
  )
  test("groups current models into the app provider catalog", () => {
    const result = normalizeProviderList(
      [{ id: "openai", name: "OpenAI", package: "@ai-sdk/openai" }] as ProviderListOutput["data"],
      [
        {
          id: "gpt-5",
          modelID: "gpt-5",
          providerID: "openai",
          name: "GPT-5",
          capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
          variants: [{ id: "high" }],
          time: { released: 1 },
          cost: [{ input: 1, output: 2, cache: { read: 0.1, write: 0.2 } }],
          status: "active",
          enabled: true,
          limit: { context: 128_000, output: 8_192 },
        },
        {
          id: "gpt-old",
          modelID: "gpt-old",
          providerID: "openai",
          name: "GPT Old",
          capabilities: { tools: false, input: ["text"], output: ["text"] },
          variants: [],
          time: { released: 0 },
          cost: [],
          status: "deprecated",
          enabled: true,
          limit: { context: 1, output: 1 },
        },
      ] as ModelListOutput["data"],
    )

    expect(result.connected).toEqual(["openai"])
    expect(result.default).toEqual({ openai: "gpt-5" })
    expect(result.all.get("openai")?.models["gpt-old"]).toBeUndefined()
    expect(result.all.get("openai")?.models["gpt-5"]).toMatchObject({
      id: "gpt-5",
      providerID: "openai",
      capabilities: { toolcall: true, attachment: true },
      cost: { input: 1, output: 2 },
      variants: { high: {} },
    })
  })
})

describe("normalizeProjectInfo", () => {
  test("keeps the project VCS backend", () => {
    const project = { id: "prj", canonical: "/repo", time: { created: 1, updated: 1, active: 1 }, sandboxes: [] }
    expect(normalizeProjectInfo({ ...project, vcs: "git" } as Project).vcs).toBe("git")
    expect(normalizeProjectInfo({ ...project, vcs: "hg" } as Project).vcs).toBe("hg")
    expect(normalizeProjectInfo(project as Project).vcs).toBeUndefined()
  })
})

test.each([
  ["C:\\Repos\\sst\\opencode", "C:/Repos/sst/opencode"],
  ["C:/Repos/sst/opencode", "C:/Repos/sst/opencode"],
  ["/tmp/foo\\bar", "/tmp/foo\\bar"],
  ["C:/Repos/sst/opencode/", "C:/Repos/sst/opencode"],
  ["C:/", "C:/"],
  ["/", "/"],
])("directoryKey(%p) is %p", (input, expected) => {
  expect(String(directoryKey(input))).toBe(expected)
})
