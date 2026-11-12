import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { formatServerError } from "@/runtime/server/errors"

export function ContextDialog(props: { sessionID: string }) {
  const data = useData()
  const server = useServerSDK()
  const dialog = useDialog()
  const language = useLanguage()
  const current = data.session.get(props.sessionID)?.compaction
  const [state, setState] = createStore({
    auto: current?.auto === undefined ? "default" : current.auto ? "on" : "off",
    threshold: current?.threshold?.toString() ?? "",
    saving: false,
    error: "",
  })
  const valid = () =>
    state.threshold === "" ||
    (Number.isInteger(Number(state.threshold)) && Number(state.threshold) >= 1 && Number(state.threshold) <= 99)
  const save = async () => {
    if (state.saving || !valid()) return
    setState({ saving: true, error: "" })
    try {
      await server.api.session.update({
        sessionID: props.sessionID,
        compaction: {
          ...(state.auto === "default" ? {} : { auto: state.auto === "on" }),
          ...(state.threshold === "" ? {} : { threshold: Number(state.threshold) }),
        },
      })
      data.session.invalidate(props.sessionID)
      await data.session.sync(props.sessionID)
      dialog.close()
    } catch (error) {
      setState("error", formatServerError(error))
    } finally {
      setState("saving", false)
    }
  }
  return (
    <Dialog fit containerClass="max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)]">
      <DialogHeader>
        <DialogTitle>{language.t("context.settings")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="!overflow-y-auto">
        <form
          class="flex flex-col gap-4 px-4 pb-4 text-13-regular leading-5"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <p class="text-text-weak">{language.t("context.description")}</p>
          <label class="flex items-center justify-between gap-3">
            <span>{language.t("context.auto")}</span>
            <select
              class="rounded-md border border-border-base bg-background-base px-3 py-2"
              value={state.auto}
              disabled={state.saving}
              onChange={(event) => setState("auto", event.currentTarget.value)}
            >
              <option value="default">{language.t("context.default")}</option>
              <option value="on">{language.t("context.on")}</option>
              <option value="off">{language.t("context.off")}</option>
            </select>
          </label>
          <label class="flex flex-col gap-2">
            <span>{language.t("context.threshold")}</span>
            <input
              aria-label={language.t("context.threshold")}
              class="rounded-md border border-border-base bg-background-base px-3 py-2"
              type="number"
              min="1"
              max="99"
              step="1"
              placeholder={language.t("context.default")}
              value={state.threshold}
              disabled={state.saving || state.auto === "off"}
              onInput={(event) => setState("threshold", event.currentTarget.value)}
            />
          </label>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={state.saving || state.auto === "off"}
              onClick={() => setState("threshold", "")}
            >
              {language.t("context.default")}
            </Button>
            <For each={[70, 85, 95]}>
              {(value) => (
                <Button
                  type="button"
                  variant="outline"
                  disabled={state.saving || state.auto === "off"}
                  onClick={() => setState("threshold", String(value))}
                >
                  {value}%
                </Button>
              )}
            </For>
          </div>
          <p class="text-text-weak">
            {language.t(state.auto === "off" ? "context.disabledHint" : "context.reserveHint")}
          </p>
          <Show when={state.error}>
            <p role="alert" class="text-text-error">
              {state.error}
            </p>
          </Show>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={state.saving} onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="submit" disabled={state.saving || !valid()}>
              {language.t("common.save")}
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}
