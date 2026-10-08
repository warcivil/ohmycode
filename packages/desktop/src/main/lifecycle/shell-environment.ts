// Shell tools and credentials are imported, but storage stays in the app's profile.
export function applicationEnvironment(current: NodeJS.ProcessEnv, shell: Record<string, string> | null) {
  return {
    ...shell,
    ...Object.fromEntries(
      ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"].flatMap((key) =>
        current[key] === undefined ? [] : [[key, current[key]]],
      ),
    ),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
  }
}
