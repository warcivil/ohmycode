import { expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageCompactionCompleted } from "@opencode/client/promise"
import { contextUsage } from "./context-usage"

const model = { id: "model", providerID: "provider" }
const answer: SessionMessageAssistant = {
  id: "msg_answer",
  type: "assistant",
  agent: "build",
  model,
  content: [],
  time: { created: 1, completed: 2 },
  tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 1000, write: 200 } },
}
const checkpoint: SessionMessageCompactionCompleted = {
  id: "msg_checkpoint",
  type: "compaction",
  status: "completed",
  reason: "manual",
  summary: "Short summary",
  recent: "",
  time: { created: 3 },
}

test("counts cached context once, without cumulative billing", () => {
  expect(contextUsage([answer, { ...answer, id: "msg_next" }], model)).toBe(1360)
})
test("does not show stale usage after compaction or a model change", () => {
  expect(contextUsage([answer, checkpoint], model)).toBeUndefined()
  expect(contextUsage([answer], { ...model, id: "other" })).toBeUndefined()
  expect(contextUsage([answer], undefined)).toBeUndefined()
  expect(contextUsage([answer, checkpoint, { ...answer, id: "msg_next" }], model)).toBe(1360)
})
