import { expect, test } from "bun:test"
import config from "./electron-builder.config"
import preview from "./electron-builder.macos-test"

test("macOS preview keeps application identity and bundled core without weakening release signing", () => {
  expect(preview.appId).toBe(config.appId)
  expect(preview.extraResources).toEqual(config.extraResources)
  expect(preview.mac?.target).toEqual(["dmg", "zip"])
  expect(preview.mac?.identity).toBe("-")
  expect(preview.mac?.notarize).toBe(false)
  expect(preview.mac?.hardenedRuntime).toBe(false)
  expect(config.mac?.notarize).toBe(true)
  expect(config.mac?.hardenedRuntime).toBe(true)
})
