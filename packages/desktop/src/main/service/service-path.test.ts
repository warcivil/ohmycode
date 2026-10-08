import { expect, test } from "bun:test"
import path from "node:path"
import { serviceFilename, serviceRegistrationFile } from "./service-path"

test("desktop discovers the same channel registration and config filename as its bundled CLI", () => {
  for (const [channel, filename] of [
    ["prod", "service-prod.json"],
    ["dev", "service.json"],
    ["beta", "service.json"],
    ["local", "service-local.json"],
    ["latest", "service.json"],
    ["next", "service.json"],
  ]) {
    expect(serviceFilename(channel!)).toBe(filename!)
    expect(serviceRegistrationFile(channel!, "/profile/state")).toBe(path.join("/profile/state", "opencode", filename!))
  }
})
