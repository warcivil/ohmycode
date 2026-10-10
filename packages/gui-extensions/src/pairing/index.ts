import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Pairing } from "./contract"
import en from "./i18n/en"
import ru from "./i18n/ru"
import { emptyRemote, RemoteState } from "./remote-contract"

export default Extension.define({
  id: "pairing",
  provides: { pairing: Pairing },
  stores: {
    remote: Store.main(RemoteState, emptyRemote),
    // Whether main keeps the display awake; stored before in the desktop's own settings namespace.
    keepScreenActive: Store.main(Schema.Boolean, false, { state: ["opencode.settings", "keepScreenActive"] }),
  },
  i18n: { en, ru },
})
