/** Public OhMyCode update feed. Each installation channel stays isolated. */
export function updateFeed(channel: "local" | "dev" | "beta" | "prod") {
  return {
    provider: "generic" as const,
    url: `https://ohmylama.ru/api/uploads/ohmycode-updates/${channel}`,
    channel: "latest",
  }
}
