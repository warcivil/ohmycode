import { expect, test } from "bun:test"
import path from "node:path"
import { applicationProfile } from "./profile"

test("update relaunch keeps the same profile with inherited XDG config across channels", () => {
  for (const id of ["ru.ohmylama.ohmycode", "ru.ohmylama.ohmycode.dev", "ru.ohmylama.ohmycode.beta"]) {
    const base = path.resolve("custom-config")
    const expected = path.join(base, id)
    expect(applicationProfile(base, id)).toBe(expected)
    expect(applicationProfile(path.join(expected, "config"), id)).toBe(expected)
    expect(applicationProfile(path.join(expected, "config", id, "config"), id)).toBe(expected)
    expect(applicationProfile(path.join(base, "other-app", "config"), id)).toBe(
      path.join(base, "other-app", "config", id),
    )
  }
})
