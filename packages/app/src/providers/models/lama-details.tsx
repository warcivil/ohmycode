import { For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { lamaPrice, useLamaCatalog } from "./lama-catalog"

export function LamaStatusDot(props: { model: string; provider?: string }) {
  const catalog = useLamaCatalog()
  const language = useLanguage()
  const state = () => catalog?.state(props.model) ?? "unknown"

  const color = () =>
    ({
      up: "var(--icon-success-base)",
      slow: "var(--icon-warning-base)",
      down: "var(--icon-critical-base)",
      unknown: "var(--icon-weak-base)",
    })[state()]

  const label = () => {
    const status = language.t(`lama.status.${state()}`)
    const checked = catalog?.health(props.model)?.checked_at
    const date = checked ? new Date(checked) : undefined

    return date && Number.isFinite(date.getTime())
      ? `${status} · ${language.t("lama.checked", { time: date.toLocaleString(language.intl()) })}`
      : status
  }

  return (
    <Show when={props.provider === "ohmylama"}>
      <span
        role="img"
        aria-label={label()}
        title={label()}
        class="inline-block size-2 shrink-0 rounded-full"
        style={{ "background-color": color() }}
      />
    </Show>
  )
}

export function LamaPrices(props: { model: string; provider?: string; detailed?: boolean }) {
  const catalog = useLamaCatalog()
  const language = useLanguage()
  const prices = () => lamaPrice(catalog?.prices(), props.model)

  const usd = (value: number) =>
    new Intl.NumberFormat(language.intl(), { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(
      value,
    )

  const money = (value: number) => {
    const rate = catalog?.prices()?.usd_rub_rate

    return (
      usd(value) +
      (rate
        ? ` ≈ ${new Intl.NumberFormat(language.intl(), { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value * rate)}`
        : "")
    )
  }

  const fields = ["lama.input", "lama.output", "lama.cacheRead", "lama.cacheWrite", "lama.cacheWriteHour"] as const

  return (
    <Show when={props.provider === "ohmylama"}>
      <div class="text-[12px] leading-4 text-v2-text-text-muted whitespace-normal">
        <Show when={prices()} fallback={language.t("lama.pricesUnavailable")}>
          {(price) => (
            <Show
              when={props.detailed}
              fallback={language.t("lama.priceSummary", { input: usd(price()[0]), output: usd(price()[1]) })}
            >
              <div class="flex flex-col gap-1 border-t border-v2-border-border-muted pt-2 mt-1">
                <span>{language.t("lama.priceUnit")}</span>
                <For each={fields}>
                  {(key, index) => (
                    <Show when={price()[index()] !== undefined}>
                      <div class="flex justify-between gap-3">
                        <span>{language.t(key)}</span>
                        <span class="text-right">{money(price()[index()])}</span>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
            </Show>
          )}
        </Show>
      </div>
    </Show>
  )
}
