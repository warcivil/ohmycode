import path from "node:path"

// Match the bundled CLI's channel-specific service configuration and registration.
export function serviceFilename(channel: string) {
  if (["latest", "dev", "beta", "next"].includes(channel)) return "service.json"

  return `service-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

export function serviceRegistrationFile(channel: string, stateHome: string) {
  return path.join(stateHome, "opencode", serviceFilename(channel))
}
