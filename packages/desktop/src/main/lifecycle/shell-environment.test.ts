import { expect, test } from "bun:test"
import { applicationEnvironment } from "./shell-environment"

test("shell loading cannot remove or replace app-owned storage across desktop channels", () => {
  for (const channel of ["dev", "beta", "prod"]) {
    const current = Object.fromEntries(
      ["DATA", "CONFIG", "CACHE", "STATE"].map((kind) => [
        `XDG_${kind}_HOME`,
        `/profile/${channel}/${kind.toLowerCase()}`,
      ]),
    )
    for (const shell of [
      null,
      { PATH: "/shell/bin" },
      { PATH: "/shell/bin", XDG_STATE_HOME: "/shell/state", XDG_CONFIG_HOME: "/shell/config" },
    ]) {
      const merged = applicationEnvironment(current, shell)
      expect(merged).toMatchObject(current)
      expect(merged.OPENCODE_CLIENT).toBe("desktop")
      if (shell) expect(merged.PATH).toBe("/shell/bin")
    }
  }
})
