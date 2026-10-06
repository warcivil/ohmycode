import { Schema } from "effect"
import { Rpc } from "./rpc.js"

export const LamaAccount = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ready"), balance: Schema.Finite, currency: Schema.Literal("RUB") }),
  Schema.Struct({ status: Schema.Literals(["disconnected", "invalid-key", "blocked", "unavailable"]) }),
])

export const LamaAccountRpc = Rpc.define({
  id: "ohmycode.account",
  methods: { get: { input: Schema.Struct({}), output: LamaAccount } },
  events: {},
})
