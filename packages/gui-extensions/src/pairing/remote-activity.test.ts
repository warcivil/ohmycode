import { describe, expect, test } from "bun:test"
import { describeActivity } from "./remote-activity"

describe("Telegram activity labels", () => {
  test("browser opening is reported only as completed after tool completion", () => {
    expect(describeActivity([{ tool: "browser.tabs.open", status: "running" }])).toContain("Открывает браузер")
    expect(describeActivity([{ tool: "browser.tabs.open", status: "completed" }])).toContain("Открыл браузер")
    expect(describeActivity([{ tool: "browser.tabs.open", status: "error" }])).not.toContain("Открыл браузер")
  })

  test("search details show the query and fetching shows only the host", () => {
    expect(describeActivity([{ tool: "websearch", status: "running", input: { query: "новости  науки" } }])).toContain("Ищет в интернете · новости науки")
    const fetch = describeActivity([{ tool: "webfetch", status: "running", input: { url: "https://example.org/private?token=secret" } }])
    expect(fetch).toContain("Читает страницу · example.org")
    expect(fetch).not.toContain("secret")
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
