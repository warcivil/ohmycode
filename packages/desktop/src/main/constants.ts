import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "OhMyCode Dev",
  beta: "OhMyCode Beta",
  prod: "OhMyCode",
}

const appIDs: Record<string, string> = {
  dev: "ru.ohmylama.ohmycode.dev",
  beta: "ru.ohmylama.ohmycode.beta",
  prod: "ru.ohmylama.ohmycode",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "OhMyCode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ru.ohmylama.ohmycode.dev"
