import { Schema } from "effect"

export const RemoteLink = Schema.Struct({ channel: Schema.Literals(["web", "telegram"]), owner: Schema.String, name: Schema.String, confirmation: Schema.String })

export const WebAccount = Schema.Struct({ account: Schema.String, name: Schema.String })

export const RemoteState = Schema.Struct({
  channel: Schema.optional(Schema.Literals(["web", "telegram"])),
  web: Schema.optional(Schema.NullOr(WebAccount)),
  pending: Schema.optional(Schema.NullOr(RemoteLink)),
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
  channel: Schema.optional(Schema.Literals(["web", "telegram"])),
  webConnected: Schema.optional(Schema.Boolean),
  telegramConnected: Schema.optional(Schema.Boolean),
  confirmation: Schema.optional(Schema.String),
  state: Schema.Literals(["off", "pairing", "confirm", "connected", "offline"]),
  url: Schema.String,
  user: Schema.NullOr(Schema.Number),
  name: Schema.String,
})

export const RemoteCommand = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^tg-[0-9]+$/)),
  kind: Schema.Literals(["sessions", "new", "prompt", "stop", "status", "permission", "models", "model", "variants", "details", "question"]),
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
  form: Schema.optional(Schema.String.check(Schema.isPattern(/^frm_[a-zA-Z0-9_-]+$/))),
  answer: Schema.optional(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Array(Schema.String)]))),
  cancel: Schema.optional(Schema.Boolean),
  decision: Schema.optional(Schema.Literals(["once", "always", "reject"])),
})
