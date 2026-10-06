import { createMemo, createResource } from "solid-js"
import { Option, Schema } from "effect"

const Rate = Schema.Struct({ usd_rub_rate: Schema.Finite.check(Schema.isGreaterThan(0)) })

export function createLamaMoney(locale: () => string) {
  const [rate] = createResource(() =>
    fetch("https://ohmylama.ru/api/models/prices", { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        if (!response.ok) return

        return Option.getOrUndefined(Schema.decodeUnknownOption(Rate)(await response.json()))?.usd_rub_rate
      })
      .catch(() => undefined),
  )

  return createMemo(() => {
    const usd = new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 6 })
    const rub = new Intl.NumberFormat(locale(), { style: "currency", currency: "RUB", maximumFractionDigits: 4 })
    const exchange = rate()

    return { format: (value: number) => usd.format(value) + (exchange ? ` ≈ ${rub.format(value * exchange)}` : "") }
  })
}
