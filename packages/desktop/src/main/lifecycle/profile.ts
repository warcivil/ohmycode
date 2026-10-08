import path from "node:path"

// Relaunches inherit the XDG_CONFIG_HOME set for the CLI. Electron uses it as
// appData on Linux, so strip our own config suffix before selecting the profile.
export function applicationProfile(appData: string, appID: string) {
  while (path.basename(appData) === "config" && path.basename(path.dirname(appData)) === appID) {
    appData = path.dirname(path.dirname(appData))
  }

  return path.join(appData, appID)
}
