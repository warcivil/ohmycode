import { Button } from "@opencode/ui/button"
import { createSignal, Show } from "solid-js"
import { useExtension } from "../sdk"
import type { UpdaterState } from "./contract"
import type definition from "./index"

export default function UpdateBanner(props: { state: () => UpdaterState | undefined; install: () => void }) {
  const ctx = useExtension<typeof definition>()
  const [dismissed, setDismissed] = createSignal<string>()

  const update = () => {
    const state = props.state()

    if (state?.status !== "ready" && state?.status !== "installing") return

    if (state.version === dismissed()) return

    return state
  }

  return (
    <Show when={update()}>
      {(current) => (
        <div
          data-component="update-banner"
          role="status"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-border-base bg-background-stronger px-4 py-3 text-text-strong"
        >
          <div class="min-w-0 text-13-regular">
            {ctx.t("dialog.ready.message", { version: current().version })}
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button variant="ghost" disabled={current().status === "installing"} onClick={() => setDismissed(current().version)}>
              {ctx.t("dialog.later")}
            </Button>
            <Button
              variant="contrast"
              disabled={current().status === "installing"}
              onClick={() => props.install()}
            >
              {ctx.t(current().status === "installing" ? "action.installing" : "action.installRestart")}
            </Button>
          </div>
        </div>
      )}
    </Show>
  )
}
