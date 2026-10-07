import { $ } from "bun"
import { join } from "node:path"
import { createRequire } from "node:module"
import { getCurrentCli } from "../packages/desktop/scripts/utils"

const root = join(import.meta.dirname, "..")
process.chdir(root)
process.env.OPENCODE_VERSION = `${(await Bun.file(join(root, "package.json")).json()).version}-ohmycode.4`
process.env.OPENCODE_CHANNEL = "dev"
process.env.NODE_OPTIONS ??= "--max-old-space-size=6144"
const electronInstall = createRequire(join(root, "packages/desktop/package.json")).resolve("electron/install.js")
await $`node ${electronInstall}`
await $`bun run --cwd packages/app build`
const target = getCurrentCli().package.replace("@opencode/cli-", "opencode-")
await $`bun packages/cli/script/build.ts --target=${target} --skip-install --skip-web-ui`
process.env.OPENCODE_CLI_DIST = join(root, "packages/cli/dist")
await $`bun run --cwd packages/desktop build`
console.log("OhMyCode ready. Run ./start-ohmycode.sh")
