import type { Configuration } from "electron-builder"
import config from "./electron-builder.config"

// Local ad-hoc signing lets both architectures launch in CI without Apple credentials.
// This configuration is only for manually tested artifacts, never a notarized release.
export default {
  ...config,
  mac: { ...config.mac, identity: "-", notarize: false, hardenedRuntime: false },
  dmg: { ...config.dmg, sign: false },
} satisfies Configuration
