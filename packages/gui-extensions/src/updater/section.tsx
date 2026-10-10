import { createMemo, Show, type JSX } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { useExtension } from "../sdk"
import { updaterAction } from "./action"
import type { UpdaterState } from "./contract"
import type definition from "./index"

export default function UpdatesSection(props: { state: () => UpdaterState | undefined; run: () => void }) {
  const ctx = useExtension<typeof definition>()
  const releaseNotes = ctx.stores.releaseNotes
  const action = createMemo(() => updaterAction(props.state()))

  const progress = () => {
    const state = props.state()

    return state?.status === "downloading" ? state.progress : undefined
  }

  const megabytes = createMemo(
    () =>
      new Intl.NumberFormat(ctx.locale.locale(), {
        style: "unit",
        unit: "megabyte",
        maximumFractionDigits: 1,
      }),
  )

  const percent = createMemo(
    () =>
      new Intl.NumberFormat(ctx.locale.locale(), {
        style: "percent",
        maximumFractionDigits: 0,
      }),
  )

  return (
    <div class="settings-section">
      <h3 class="settings-section-title">{ctx.t("section.title")}</h3>

      <div data-component="settings-list">
        <Row title={ctx.t("releaseNotes.title")} description={ctx.t("releaseNotes.description")}>
          <div data-action="settings-release-notes">
            <Switch
              checked={releaseNotes.value.enabled}
              onChange={(checked) =>
                releaseNotes.update((draft) => {
                  draft.enabled = checked
                })
              }
            />
          </div>
        </Row>

        <Row title={ctx.t("check.title")} description={ctx.t("check.description")}>
          <div class="flex flex-col items-end gap-2 max-w-full">
            <Button
              data-action="settings-check-updates"
              size="normal"
              variant="neutral"
              disabled={!action().run}
              onClick={() => props.run()}
            >
              {ctx.t(action().label)}
            </Button>
            <Show when={progress()}>
              {(value) => (
                <div class="flex flex-col gap-1 w-48 max-w-full text-text-weak text-12-regular tabular-nums">
                  <div class="flex justify-between gap-2">
                    <span>{percent().format(value().transferred / value().total)}</span>
                    <span>
                      {megabytes().format(value().transferred / 1_000_000)} /{" "}
                      {megabytes().format(value().total / 1_000_000)}
                    </span>
                  </div>
                  <progress
                    class="w-full h-1"
                    aria-label={ctx.t("action.downloading")}
                    value={value().transferred}
                    max={value().total}
                  />
                </div>
              )}
            </Show>
          </div>
        </Row>
      </div>
    </div>
  )
}

// The host's settings row markup; its stylesheet is loaded with the settings screen.
function Row(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{props.title}</div>
        <div data-slot="settings-row-description">{props.description}</div>
      </div>
      <div data-slot="settings-row-control">{props.children}</div>
    </div>
  )
}
