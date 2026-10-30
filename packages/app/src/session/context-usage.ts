import type { SessionMessageInfo, ModelInfo } from "@opencode/client/promise"

/** Last measured window, not cumulative billing tokens. Unknown after a checkpoint/model change. */
export function contextUsage(
  messages: readonly SessionMessageInfo[],
  model: Pick<ModelInfo, "id" | "providerID"> | undefined,
) {
  if (!model) return
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.type === "compaction" && message.status === "completed") return
    if (message.type !== "assistant" || !message.tokens || message.error) continue
    if (message.model.providerID !== model.providerID || message.model.id !== model.id) return
    const tokens = message.tokens
    if (tokens.input + tokens.cache.read + tokens.cache.write === 0) continue
    return tokens.input + tokens.cache.read + tokens.cache.write + tokens.output + tokens.reasoning
  }
}
