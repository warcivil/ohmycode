import { WebSearchLama } from "./lama.js"

// Product search runs through the authenticated OhMyLama backend only.
export const WebSearchPlugins = [WebSearchLama.Plugin] as const
