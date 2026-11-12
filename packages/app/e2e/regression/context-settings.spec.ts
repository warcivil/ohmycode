import { test, expect } from "@playwright/test"
import type { SessionCompactionSettings } from "@opencode/client/promise"
import { openSession } from "../utils/workspace"
import { currentSession } from "../utils/mock-server"

test.use({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } })

test("context footer configures, persists and resets per-session compaction", async ({ page }) => {
  const workspace = await openSession(page, { name: "ContextControls", seed: { locale: "en" } })
  let compaction: SessionCompactionSettings = {}
  await page.route("**/api/session/" + workspace.session.id, async (route) => {
    if (route.request().method() === "PATCH") {
      compaction = route.request().postDataJSON().compaction
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({ json: { data: { ...currentSession(workspace.session, workspace.directory), compaction } } })
  })
  await page.getByTestId("context-footer").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport()
  await page.screenshot({ path: "e2e/test-results/context-settings.png" })
  await page.getByRole("button", { name: "70%", exact: true }).click()
  await page.getByRole("combobox").selectOption("off")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(compaction).toEqual({ auto: false, threshold: 70 })
  await expect(page.getByTestId("context-footer")).toContainText("Auto compaction off")
  await page.reload()
  await page.getByTestId("context-footer").click()
  await expect(page.getByRole("combobox")).toHaveValue("off")
  await page.getByRole("combobox").selectOption("on")
  await page.getByRole("spinbutton").fill("100")
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await page.getByRole("spinbutton").fill("85")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByTestId("context-footer")).toContainText("Compact at 85%")
  await workspace.editor.fill("/context")
  await page
    .getByRole("button", { name: "/context Set the automatic compaction threshold for this chat", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("combobox").selectOption("default")
  await page.getByRole("spinbutton").fill("")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(compaction).toEqual({})
})
