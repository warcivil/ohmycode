import { Schema } from "effect"
import { optional } from "./schema.js"

/** Per-session overrides. An empty object restores the configured defaults. */
export const CompactionSettings = Schema.Struct({
  auto: Schema.Boolean.pipe(optional),
  threshold: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 99 })).pipe(optional),
}).annotate({ identifier: "Session.CompactionSettings" })
export interface CompactionSettings extends Schema.Schema.Type<typeof CompactionSettings> {}
