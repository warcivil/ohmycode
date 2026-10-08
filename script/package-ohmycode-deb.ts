import { $ } from "bun"
import { join } from "node:path"

if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("This package command currently supports Linux x64 only")

const root = join(import.meta.dirname, "..")
process.chdir(root)
await $`bun run build:ohmycode`
process.env.OPENCODE_CHANNEL = "dev"
process.env.OPENCODE_VERSION = (
  await Bun.file(join(root, "packages/desktop/resources/opencode-cli.version")).text()
).trim()
await $`bun run package:linux -- --x64 --linux deb`.cwd(join(root, "packages/desktop"))
await Bun.write(
  join(root, "packages/desktop/dist/INSTALL-UBUNTU.txt"),
  `OhMyCode Dev — установка на Ubuntu (Intel/AMD x86-64)

Скачайте .deb и откройте терминал в папке с ним:
sudo apt install ./ohmycode-dev-${process.env.OPENCODE_VERSION}-linux-amd64.deb

Запустите OhMyCode Dev из меню приложений и войдите в LAMA или подключите свой API-ключ.
Bun, Node.js и исходники для запуска не нужны. Работа оплачивается с API-баланса LAMA.
Не запускайте приложение через sudo или с --no-sandbox.

Обновление: приложение проверяет новые версии при запуске и каждые 10 минут.
Нажмите «Установить и перезапустить», когда обновление загружено. Ubuntu может
запросить пароль для установки пакета. Ручной способ: установить новый .deb
той же командой apt install. Настройки и диалоги сохраняются локально;
между компьютерами они автоматически не синхронизируются.

Удаление: sudo apt remove ohmycode-dev
Личные данные остаются в ~/.config/ru.ohmylama.ohmycode.dev

Подробная инструкция: https://github.com/warcivil/ohmycode/blob/v2/INSTALL-UBUNTU.md
`,
)
if (!(await Bun.file(join(root, "packages/desktop/dist/latest-linux.yml")).exists()))
  throw new Error("Ubuntu update manifest was not generated")
console.log("Ubuntu package ready in packages/desktop/dist")
