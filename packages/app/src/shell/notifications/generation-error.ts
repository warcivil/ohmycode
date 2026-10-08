import { Option, Schema } from "effect"
import type { SessionError } from "@opencode/schema/session-error"

const ResponseError = Schema.fromJsonString(
  Schema.Struct({
    error: Schema.optional(
      Schema.Struct({ code: Schema.optional(Schema.String), message: Schema.optional(Schema.String) }),
    ),
    detail: Schema.optional(Schema.String),
  }),
)

/** Classify terminal generation failures without exposing raw upstream responses in notifications. */
export function generationErrorKind(error: SessionError.Error) {
  if (!error.type.startsWith("provider.")) return

  const body = error.response
    ? Option.getOrUndefined(Schema.decodeUnknownOption(ResponseError)(error.response.body))
    : undefined

  const code = body?.error?.code
  const message = [error.message, body?.error?.message, body?.detail].filter(Boolean).join(" ")

  if (error.status === 402 || code === "insufficient_funds" || code === "insufficient_balance") return "balance"

  if (error.status === 401 || error.type === "provider.auth") return "auth"

  if (error.status === 403 && error.type !== "provider.content-filter") return "blocked"

  if (error.status === 429 || error.type === "provider.rate-limit") return "rate-limit"

  if (
    error.status === 413 ||
    code === "context_length_exceeded" ||
    /context.{0,40}(exceed|too (long|large))|maximum context length/i.test(message)
  )
    return "context"

  if (
    error.status === 404 ||
    code === "model_not_found" ||
    code === "model_temporarily_unavailable" ||
    error.type === "provider.no-route"
  )
    return "unavailable"

  if (error.type === "provider.transport" || error.type === "provider.timeout") return "connection"

  if (error.type === "provider.internal" || (error.status !== undefined && error.status >= 500)) return "unavailable"
}
