import { $ } from "bun"
import { join } from "node:path"
import { createHash } from "node:crypto"

if (process.platform !== "darwin" || !["x64", "arm64"].includes(process.arch))
  throw new Error("Build macOS artifacts on the matching macOS runner")

const root = join(import.meta.dirname, "..")
const channel = Bun.env.OHMYCODE_BUILD_CHANNEL === "prod" ? "prod" : "dev"
process.chdir(root)
process.env.OHMYCODE_BUILD_CHANNEL = channel
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
await $`bun run build:ohmycode`
process.env.OPENCODE_CHANNEL = channel
process.env.OPENCODE_VERSION = (await Bun.file(join(root, "packages/desktop/resources/opencode-cli.version")).text()).trim()
await $`bunx electron-builder --mac --${process.arch} --config electron-builder.macos-test.ts --publish never`.cwd(join(root, "packages/desktop"))
const dist = join(root, "packages/desktop/dist")
const sums = await Promise.all(["dmg", "zip"].map(async (extension) => {
  const name = `ohmycode-${channel}-${process.env.OPENCODE_VERSION}-mac-${process.arch}.${extension}`
  const file = Bun.file(join(dist, name))
  if (!(await file.exists()) || !file.size) throw new Error(`Missing macOS artifact: ${name}`)
  return `${createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex")}  ${name}`
}))
await Bun.write(join(dist, `SHA256SUMS-MAC-${process.arch}.txt`), sums.join("\n") + "\n")
await Bun.write(join(dist, "INSTALL-MAC.txt"), `OhMyCode — macOS ${process.arch === "x64" ? "Intel" : "Apple Silicon"}\n\nОткройте DMG и перенесите OhMyCode в Applications. Bun и Node.js устанавливать не нужно.\nЭто тестовая сборка с локальной ad-hoc подписью, без Developer ID и notarization Apple.\nПосле проверки источника и SHA256 разрешите запуск в настройках macOS «Конфиденциальность и безопасность», если система его блокирует. Не отключайте Gatekeeper целиком.\nПеред тестом сохраните важные данные и закройте предыдущий OhMyCode.\nПроверьте вход в LAMA, новый чат, ответ модели, терминал, перезапуск и историю.\n`)
