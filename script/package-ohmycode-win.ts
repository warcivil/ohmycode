import { $ } from "bun"
import { join } from "node:path"
import { createHash } from "node:crypto"

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("Build the Windows x64 installer on Windows x64 using the ohmycode-windows workflow")

const root = join(import.meta.dirname, "..")
const channel = Bun.env.OHMYCODE_BUILD_CHANNEL === "prod" ? "prod" : "dev"
process.env.OHMYCODE_BUILD_CHANNEL = channel
process.chdir(root)
await $`bun run build:ohmycode`
process.env.OPENCODE_CHANNEL = channel
process.env.OPENCODE_VERSION = (
  await Bun.file(join(root, "packages/desktop/resources/opencode-cli.version")).text()
).trim()
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
await $`bun run package:win -- --x64 --publish never`.cwd(join(root, "packages/desktop"))
const dist = join(root, "packages/desktop/dist")
const name = `ohmycode-${channel}-${process.env.OPENCODE_VERSION}-win-x64.exe`
const installer = Bun.file(join(dist, name))

if (!(await installer.exists()) || installer.size === 0) throw new Error(`Windows installer missing: ${name}`)
if (!(await Bun.file(join(dist, "latest.yml")).exists())) throw new Error("Windows update manifest was not generated")

const sha256 = createHash("sha256")
  .update(new Uint8Array(await installer.arrayBuffer()))
  .digest("hex")
await Bun.write(join(dist, "SHA256SUMS-WINDOWS.txt"), `${sha256}  ${name}\n`)
await Bun.write(
  join(dist, "INSTALL-WINDOWS.txt"),
  `${channel === "prod" ? "OhMyCode" : "OhMyCode Dev"} — Windows 10/11 x64

Запустите ${name}, затем откройте приложение через меню «Пуск» и войдите в LAMA.
Bun, Node.js и исходники не нужны. Личные данные и API-ключи в установщик не включены.
Установщик не подписан: проверьте источник и SHA256SUMS-WINDOWS.txt. Не отключайте защиту Windows.
Обновление поверх предыдущей версии сохраняет настройки и диалоги.
`,
)
console.log(`Windows installer ready: ${join(dist, name)}`)
