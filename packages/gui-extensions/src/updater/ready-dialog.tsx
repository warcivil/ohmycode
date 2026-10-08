import { Button } from "@opencode/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useExtension } from "../sdk"
import type definition from "./index"

export default function UpdateReadyDialog(props: { version: string; close: () => void; install: () => void }) {
  const ctx = useExtension<typeof definition>()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("dialog.ready.title")}
          description={ctx.t("dialog.ready.message", { version: props.version })}
        />
      </DialogHeader>
      <DialogFooter>
        <Button variant="neutral" onClick={() => props.close()}>
          {ctx.t("dialog.later")}
        </Button>
        <Button variant="contrast" onClick={() => { props.close(); props.install() }}>
          {ctx.t("action.installRestart")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
