import { test, expect } from "bun:test"
import { createRoot } from "solid-js"
import { createData, type CreateDataInput } from "../src/solid"
import { OpenCode, type OpenCodeEvent } from "../src/promise"

test("live compaction settings replace old overrides including reset", () => {
  const listeners = new Set<Parameters<CreateDataInput["event"]["listen"]>[0]>()
  const setup = createRoot((dispose) => ({
    dispose,
    data: createData({
      api: () => OpenCode.make({ baseUrl: "http://opencode.local" }),
      directory: "/project",
      event: {
        on: () => () => {},
        listen(handler) {
          listeners.add(handler)
          return () => listeners.delete(handler)
        },
      },
    }),
  }))
  try {
    setup.data.session.remember({
      id: "ses_context",
      projectID: "project",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 0, updated: 0 },
      location: { directory: "/project" },
    })
    for (const compaction of [{ auto: false, threshold: 70 }, { auto: true }, {}]) {
      const event: OpenCodeEvent = {
        id: "evt_context",
        created: 1,
        type: "session.compaction.configured",
        durable: { aggregateID: "ses_context", seq: 1, version: 1 },
        data: { sessionID: "ses_context", compaction },
      }
      listeners.forEach((listener) => listener({ name: event.type, details: event }))
      expect(setup.data.session.get("ses_context")?.compaction).toEqual(compaction)
    }
  } finally {
    setup.dispose()
  }
})
