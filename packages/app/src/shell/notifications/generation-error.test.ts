import { expect, test } from "bun:test"
import type { SessionError } from "@opencode/schema/session-error"
import { generationErrorKind } from "./generation-error"

test.each([
  [{ type: "provider.quota", message: "Payment required", status: 402 }, "balance"],
  [
    {
      type: "provider.invalid-output",
      message: "Stream failed",
      response: { body: '{"error":{"code":"insufficient_funds"}}' },
    },
    "balance",
  ],
  [{ type: "provider.auth", message: "Key revoked", status: 401 }, "auth"],
  [{ type: "provider.invalid-request", message: "Access denied", status: 403 }, "blocked"],
  [{ type: "provider.rate-limit", message: "Slow down", status: 429 }, "rate-limit"],
  [{ type: "provider.invalid-request", message: "Request exceeds maximum context length", status: 400 }, "context"],
  [{ type: "provider.invalid-request", message: "Payload too large", status: 413 }, "context"],
  [
    {
      type: "provider.invalid-output",
      message: "Stream failed",
      response: { body: '{"error":{"code":"model_temporarily_unavailable"}}' },
    },
    "unavailable",
  ],
  [{ type: "provider.no-route", message: "Model not selected" }, "unavailable"],
  [{ type: "provider.internal", message: "Bad gateway", status: 502 }, "unavailable"],
  [{ type: "provider.timeout", message: "Timed out" }, "connection"],
  [{ type: "provider.transport", message: "Connection reset" }, "connection"],
  [{ type: "provider.content-filter", message: "Blocked by policy", status: 403 }, undefined],
  [
    { type: "provider.invalid-request", message: "Invalid tool schema", status: 400, response: { body: "not JSON" } },
    undefined,
  ],
  [{ type: "tool.execution", message: "Context length exceeded", status: 500 }, undefined],
  [{ type: "unknown", message: "insufficient_funds" }, undefined],
] satisfies [SessionError.Error, ReturnType<typeof generationErrorKind>][])(
  "terminal error %j has actionable category %s",
  (error, kind) => expect(generationErrorKind(error)).toBe(kind),
)
