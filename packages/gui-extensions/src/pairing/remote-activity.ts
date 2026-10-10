import { Option, Schema } from "effect"
import type { SessionMessageInfo } from "@opencode/client/promise"

const Calls = Schema.Array(Schema.Struct({ tool: Schema.String, status: Schema.String }))

const Labels: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "telegram_send_file": ["Отправляет файл в Telegram", "Отправил файл в Telegram", "Отправка файлов"],
  "webfetch": ["Читает страницу", "Прочитал страницу", "Webfetch"],
  "read": ["Читает файл", "Прочитал файл", "Чтение файлов"],
  "glob": ["Ищет файлы", "Выполнил поиск файлов", "Поиск файлов"],
  "grep": ["Ищет в файлах", "Выполнил поиск в файлах", "Поиск в файлах"],
  "search": ["Ищет доступные инструменты", "Нашёл инструменты", "Поиск инструментов"],
  "patch": ["Изменяет файлы", "Изменил файлы", "Изменение файлов"],
  "apply_patch": ["Изменяет файлы", "Изменил файлы", "Изменение файлов"],
  "shell": ["Выполняет команду", "Выполнил команду", "Команды"],
  "bash": ["Выполняет команду", "Выполнил команду", "Команды"],
  "execute": ["Выполняет инструменты", "Выполнил инструменты", "Выполнение"],
  "browser.tabs.open": ["Открывает браузер", "Открыл браузер", "Браузер"],
  "browser.tabs.focus": ["Переключает вкладку браузера", "Переключил вкладку браузера", "Браузер"],
  "browser.snapshot": ["Изучает страницу в браузере", "Изучил страницу в браузере", "Браузер"],
  "browser.click": ["Нажимает элемент на странице", "Нажал элемент на странице", "Браузер"],
  "browser.fill": ["Заполняет поле на странице", "Заполнил поле на странице", "Браузер"],
  "browser.screenshot": ["Делает снимок страницы", "Сделал снимок страницы", "Браузер"],
})

export function remoteActivity(messages: ReadonlyArray<SessionMessageInfo>) {
  const calls = messages.flatMap((message) => message.type === "assistant" ? message.content.flatMap((item) => {
    if (item.type !== "tool") return []
    const nested = item.state.status === "streaming" ? [] : Option.getOrElse(Schema.decodeUnknownOption(Calls)(item.state.metadata?.toolCalls), () => [])

    return nested.length ? nested : [{ tool: item.name, status: item.state.status }]
  }) : [])

  return describeActivity(calls)
}

export function describeActivity(calls: ReadonlyArray<{ tool: string; status: string }>) {
  const counts = new Map<string, number>()

  for (const call of calls) {
    const label = Labels[call.tool]?.[2] || (call.tool.startsWith("browser.") ? "Браузер" : "Другие инструменты")
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  const last = calls.findLast((call) => call.status === "running" || call.status === "streaming") || calls.at(-1)

  if (!last) return ""
  const labels = Labels[last.tool]
  const active = last.status === "running" || last.status === "streaming"
  const action = labels?.[active ? 0 : 1] || (last.tool.startsWith("browser.") ? "Работает с браузером" : "Выполняет инструменты")
  const state = last.status === "error" ? "Инструмент завершился с ошибкой. Агент обрабатывает результат." : action

  return `${state}\nВызовы инструментов: ${[...counts].map(([label, count]) => `${label} × ${count}`).join(" · ")}`
}
