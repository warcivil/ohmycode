import { Schema } from "effect"

export const RemoteState = Schema.Struct({
  secret: Schema.String,
  url: Schema.String,
  relay: Schema.String,
  confirmed: Schema.Boolean,
  user: Schema.NullOr(Schema.Number),
  name: Schema.String,
  watched: Schema.Array(Schema.Struct({ session: Schema.String, prompt: Schema.String, started: Schema.Number, announced: Schema.optional(Schema.Array(Schema.String)) })),
})

export const emptyRemote = { secret: "", url: "", relay: "", confirmed: false, user: null, name: "", watched: [] }

export const RemoteStatus = Schema.Struct({
  state: Schema.Literals(["off", "pairing", "confirm", "connected", "offline"]),
  url: Schema.String,
  user: Schema.NullOr(Schema.Number),
  name: Schema.String,
})

export const RemoteCommand = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^tg-[0-9]+$/)),
  kind: Schema.Literals(["sessions", "new", "prompt", "stop", "status", "permission", "models", "model", "variants", "details"]),
  session: Schema.optional(Schema.String.check(Schema.isPattern(/^ses_[a-zA-Z0-9_-]+$/))),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(16000))),
  page: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  create: Schema.optional(Schema.Boolean),
  model: Schema.optional(Schema.Struct({ id: Schema.String, providerID: Schema.String, variant: Schema.optional(Schema.String) })),
  task: Schema.optional(Schema.String.check(Schema.isPattern(/^tg-[0-9]+$/))),
  request: Schema.optional(Schema.String.check(Schema.isPattern(/^per[a-zA-Z0-9_-]+$/))),
  attachment: Schema.optional(Schema.Struct({
    id: Schema.String.check(Schema.isPattern(/^tg-[0-9]+$/)),
    name: Schema.String.check(Schema.isMaxLength(200)),
    mime: Schema.String.check(Schema.isMaxLength(150)),
    voice: Schema.Boolean,
  })),
  decision: Schema.optional(Schema.Literals(["once", "reject"])),
})
