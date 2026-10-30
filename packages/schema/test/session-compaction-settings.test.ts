import { expect, test } from "bun:test"
import { Schema } from "effect"
import { CompactionSettings } from "../src/session-compaction-settings.js"

const decode = Schema.decodeUnknownSync(CompactionSettings)
test("accepts explicit overrides and omits unspecified defaults", () => {
  expect(decode({ auto: false, threshold: 70 })).toEqual({ auto: false, threshold: 70 })
  expect(Schema.encodeSync(CompactionSettings)(decode({}))).toEqual({})
})
test("rejects unsafe or ambiguous threshold values", () => {
  for (const threshold of [0, -1, 100, 70.5, NaN, Infinity, "70"]) expect(() => decode({ threshold })).toThrow()
})
