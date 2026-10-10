import { Schema } from "effect"
import { Ipc } from "../sdk"
import { RemoteStatus } from "./remote-contract"

export const PairingInfo = Schema.Struct({ urls: Schema.Array(Schema.String) })

/** Pairs other devices with this machine's local server and keeps its display awake. */
export const Pairing = Ipc.define({
  id: "pairing",
  methods: {
    remoteStatus: { output: RemoteStatus },
    remotePair: {},
    remoteConfirm: { input: Schema.Number },
    remoteDisconnect: {},
    /** The local server's advertised URLs. */
    info: { output: PairingInfo },
    /** A single-use code for an `/auth/connect/:code` link. */
    code: { output: Schema.String },
    screenActive: { output: Schema.Boolean },
    setScreenActive: { input: Schema.Boolean },
  },
})
