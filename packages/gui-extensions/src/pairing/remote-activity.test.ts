import { describe, expect, test } from "bun:test"
import { describeActivity } from "./remote-activity"

describe("Telegram activity labels", () => {
  test("browser opening is reported only as completed after tool completion", () => {
    expect(describeActivity([{ tool: "browser.tabs.open", status: "running" }])).toContain("Открывает браузер")
    expect(describeActivity([{ tool: "browser.tabs.open", status: "completed" }])).toContain("Открыл браузер")
    expect(describeActivity([{ tool: "browser.tabs.open", status: "error" }])).not.toContain("Открыл браузер")
  })

  test("counts actual tool calls and gives running work precedence", () => {
    const text = describeActivity([
      { tool: "webfetch", status: "completed" },
      { tool: "browser.fill", status: "running" },
      { tool: "browser.snapshot", status: "completed" },
    ])

    expect(text).toContain("Webfetch × 1")
    expect(text).toContain("Браузер × 2")
    expect(text).toContain("Заполняет поле")
    expect(describeActivity([])).toBe("")
  })
})
