import { createMemo, Show } from "solid-js"
import type { ModelInfo } from "@opencode/client/promise"
import { useDialog } from "@opencode/ui/context/dialog"
import { useData } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import { ContextDialog } from "./context-dialog"
import { contextUsage } from "./context-usage"

export function ContextFooter(props: {
  sessionID: string
  model: Pick<ModelInfo, "id" | "providerID" | "limit"> | undefined
}) {
  const data = useData()
  const language = useLanguage()
  const dialog = useDialog()
  const usage = createMemo(() => contextUsage(data.session.message.list(props.sessionID), props.model))
  const limit = () => props.model?.limit.input || props.model?.limit.context
  const settings = () => data.session.get(props.sessionID)?.compaction
  const format = (value: number) =>
    new Intl.NumberFormat(language.intl(), { notation: "compact", maximumFractionDigits: 1 }).format(value)
  const label = () => {
    const used = usage()
    const max = limit()
    if (used === undefined || !max) return language.t("context.unknown")
    return language.t("context.usage", {
      used: format(used),
      limit: format(max),
      percent: Math.round((used / max) * 100),
    })
  }
  return (
    <button
      type="button"
      data-testid="context-footer"
      title={language.t("context.tooltip")}
      class="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 text-13-regular leading-4 text-text-weak hover:text-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
      onClick={() => dialog.show(() => <ContextDialog sessionID={props.sessionID} />)}
    >
      <span>{label()}</span>
      <Show
        when={settings()?.auto === false}
        fallback={
          <Show when={settings()?.threshold}>
            {(threshold) => <span>{language.t("context.custom", { percent: threshold() })}</span>}
          </Show>
        }
      >
        <span>{language.t("context.autoOff")}</span>
      </Show>
    </button>
  )
}
