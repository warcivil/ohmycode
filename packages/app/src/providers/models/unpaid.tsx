import { type Component } from "solid-js"
import { useLocal, type ModelSelection } from "@/providers/models/selection"
import { decode64 } from "@/runtime/persistence/base64"
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"

export const DialogSelectModelUnpaid: Component<{ model?: ModelSelection }> = () => {
  const local = useLocal()
  const controller = useProviderConnectController()
  controller.select("ohmylama")
  return <DialogConnectProvider controller={controller} directory={decode64(local.slug())} />
}
