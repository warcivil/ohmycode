import { $ } from "bun"
import { join } from "node:path"
import { createHash } from "node:crypto"

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("Build the Windows x64 installer on Windows x64 (or use the ohmycode-windows workflow)")

const root = join(import.meta.dirname, "..")
process.chdir(root)
await $`bun run build:ohmycode`
process.env.OPENCODE_CHANNEL = "dev"
process.env.OPENCODE_VERSION = (
  await Bun.file(join(root, "packages/desktop/resources/opencode-cli.version")).text()
).trim()
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
await $`bun run package:win -- --x64 --publish never`.cwd(join(root, "packages/desktop"))
const dist = join(root, "packages/desktop/dist")
const name = `ohmycode-dev-${process.env.OPENCODE_VERSION}-win-x64.exe`
const installer = Bun.file(join(dist, name))

if (!(await installer.exists()) || installer.size === 0) throw new Error(`Windows installer missing: ${name}`)

const sha256 = createHash("sha256")
  .update(new Uint8Array(await installer.arrayBuffer()))
  .digest("hex")
await Bun.write(join(dist, "SHA256SUMS-WINDOWS.txt"), `${sha256}  ${name}\n`)
await Bun.write(
  join(dist, "INSTALL-WINDOWS.txt"),
  `OhMyCode Dev — установка на Windows 10/11 (Intel/AMD x64)

1. Скачайте ${name} и запустите установщик.
2. Откройте OhMyCode Dev через меню «Пуск».
3. Войдите в LAMA или подключите свой API-ключ.

Работа оплачивается с API-баланса LAMA. Подписка на веб-чат его не заменяет.
Node.js, Bun и исходники для запуска установленного приложения не нужны.
Ваш API-ключ и личные данные в установщик не включены.

Это неподписанная тестовая сборка. Windows может показать предупреждение.
Перед запуском проверьте источник файла и SHA256SUMS-WINDOWS.txt.
Если политика вашей организации запрещает установку, обратитесь к администратору.
Не отключайте защиту Windows.

Обновление: полностью закройте OhMyCode Dev и запустите новый установщик.
Настройки и диалоги сохраняются локально; автообновления пока отключены.
Обычный OpenCode использует отдельный профиль.

Удаление: Параметры Windows → Приложения → OhMyCode Dev → Удалить.
`,
)
console.log(`Windows installer ready: ${join(dist, name)}`)
