import { Schema } from "effect"
import { Rpc } from "./rpc.js"

export const LamaAccount = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ready"), balance: Schema.Finite, currency: Schema.Literal("RUB") }),
  Schema.Struct({ status: Schema.Literals(["disconnected", "invalid-key", "blocked", "unavailable"]) }),
])

export const LamaAccountRpc = Rpc.define({
  id: "ohmycode.account",
  methods: {
    get: { input: Schema.Struct({}), output: LamaAccount },
    transcribe: {
      input: Schema.Struct({ file: Schema.String }),
      output: Schema.Struct({ text: Schema.String, error: Schema.optional(Schema.String) }),
    },
  },
  events: {},
})
