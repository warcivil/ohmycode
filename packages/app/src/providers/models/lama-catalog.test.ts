import { afterEach, expect, setSystemTime, test } from "bun:test"
import { lamaPrice, lamaStatus } from "./lama-catalog"

afterEach(() => setSystemTime())

test("LAMA prices use longest alias and preserve missing cache prices", () => {
  const prices = {
    unit: "USD/1M tokens" as const,
    usd_rub_rate: 88,
    prices: { "gpt-6": [1, 4], "gpt-6-sol": [0.9, 3.6, 0.12, 0.9], "grok-4.7": [0.5, 1.5, 0.125] },
  }

  expect(lamaPrice(prices, "gpt-6-sol-latest")).toEqual([0.9, 3.6, 0.12, 0.9])
  expect(lamaPrice(prices, "grok-4.7")?.[3]).toBeUndefined()
  expect(lamaPrice(prices, "unknown")).toBeUndefined()
  expect(lamaPrice(undefined, "grok-4.7")).toBeUndefined()
})

test("LAMA health distinguishes failures, slow responses and expired checks", () => {
  setSystemTime(new Date("2026-10-06T12:00:00Z"))
  const health = { is_up: true, ttft_ms: 1200, checked_at: "2026-10-06T11:59:00Z" }

  const rows = [
    [health, "up"],
    [{ ...health, is_up: null }, "unknown"],
    [{ ...health, is_up: false }, "down"],
    [{ ...health, live_status: "red" }, "down"],
    [{ ...health, live_status: "orange" }, "slow"],
    [{ ...health, ttft_ms: 30000 }, "slow"],
    [{ ...health, checked_at: "2026-10-06T10:44:00Z" }, "unknown"],
    [{ ...health, checked_at: "invalid" }, "unknown"],
    [{ ...health, checked_at: null }, "unknown"],
    [undefined, "unknown"],
  ] as const

  for (const [input, output] of rows) expect(lamaStatus(input)).toBe(output)
})
