import { remoteActivity } from "./remote-activity"
import { constants } from "node:fs"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { LamaAccount, LamaAccountRpc } from "@opencode/schema/lama-account"
import { open } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileBridge, FileRequest } from "./remote-files"
import { hostname } from "node:os"
import { Schema } from "effect"
import type { OpenCodeClient, PermissionListOutput, SessionMessageInfo } from "@opencode/client/promise"
import { emptyRemote, RemoteCommand, RemoteState, RemoteStatus } from "./remote-contract"

const Prefix = "/api/ohmycode-remote"

const Registration = Schema.Struct({ secret: Schema.String, url: Schema.String })

const Device = Schema.Struct({ confirmed: Schema.Boolean, telegram_id: Schema.NullOr(Schema.Number), telegram_name: Schema.NullOr(Schema.String) })

const Commands = Schema.Struct({ commands: Schema.Array(RemoteCommand) })

type State = typeof RemoteState.Type

type Storage = {
  readonly value: State
  set(value: State): void
}

type Endpoint = { url: string; headers: Readonly<Record<string, string>>; local: boolean }

type Reply = {
  finished?: boolean
  task?: string
  kind?: "text" | "sessions" | "permission" | "selected" | "progress" | "stage" | "models" | "variants"
  text?: string
  model?: { id: string; providerID: string }
  variants?: string[]
  models?: { id: string; providerID: string; title: string }[]
  page?: number
  more?: boolean
  create?: boolean
  sessions?: { id: string; title: string }[]
  session?: string
  request?: string
}

/** Outbound-only connector. No bot token or local server credential leaves this process. */
export class RemoteControl {
  private readonly controller = new AbortController()
  private connection = new AbortController()
  private closeBridge?: () => void
  private timer?: ReturnType<typeof setTimeout>
  private online = false
  private running = false
  private readonly permissions = new Set<string>()
  private readonly phases = new Map<string, string>()
  private readonly activityTimes = new Map<string, number>()

  constructor(private readonly stored: Storage, private readonly endpoint: () => Endpoint | undefined, private readonly storageRoot = process.env.XDG_DATA_HOME) {}

  start() {
    if (this.running) return
    this.running = true
    void this.tick()
  }

  close() {
    this.closeBridge?.()
    this.controller.abort()
    this.connection.abort()
    clearTimeout(this.timer)
  }

  async listen(root = process.env.XDG_DATA_HOME) {

    if (!root) return
    this.closeBridge = await fileBridge(join(root, "opencode"), async (input: typeof FileRequest.Type) => {
      const state = this.stored.value

      if (!this.live(state) || !state.watched.some((row) => row.session === input.session)) throw new Error("No active Telegram task")
      const file = await open(input.path, constants.O_RDONLY | constants.O_NONBLOCK)

      const bytes = await (async () => {
        try {
          const stat = await file.stat()

          if (!stat.isFile() || stat.size > 50_000_000) throw new Error("File limit exceeded")
          const buffer = Buffer.alloc(stat.size + 1)
          let size = 0

          while (size < buffer.length) {
            const read = await file.read(buffer, size, buffer.length - size, null)

            if (!read.bytesRead) break
            size += read.bytesRead
          }

          if (size > stat.size) throw new Error("File limit exceeded")

          return buffer.subarray(0, size)
        } finally { await file.close() }
      })()

      if (!this.live(state)) throw new Error("Connection revoked")

      const response = await fetch(`${state.relay}${Prefix}/device/files/${encodeURIComponent(input.id)}`, {
        method: "POST", headers: { authorization: `Bearer ${state.secret}`, "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(basename(input.path)) },
        body: bytes, signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(330000)]), redirect: "error",
      })

      if (!response.ok) throw new Error("Telegram file delivery failed")
    })

    if (this.controller.signal.aborted) this.closeBridge()
  }

  status(): typeof RemoteStatus.Type {
    const state = this.stored.value

    return {
      state: !state.secret ? "off" : !this.online ? "offline" : state.confirmed ? "connected" : state.user ? "confirm" : "pairing",
      url: state.url,
      user: state.user,
      name: state.name,
    }
  }

  async pair() {
    if (this.stored.value.secret) await this.disconnect()
    const relay = new URL(process.env.OHMYCODE_REMOTE_URL || "https://ohmylama.ru")

    if (relay.protocol !== "https:" && !(relay.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(relay.hostname))) {
      throw new Error("Remote relay requires HTTPS")
    }

    if (relay.username || relay.password || relay.pathname !== "/" || relay.search || relay.hash) throw new Error("Invalid relay origin")
    const value = Schema.decodeUnknownSync(Registration)(await this.request(relay.origin, "", "/devices", { name: hostname().slice(0, 80) }))

    if (this.controller.signal.aborted) return
    const link = new URL(value.url)

    if (link.origin !== "https://t.me" || link.username || link.password) throw new Error("Invalid pairing link")
    this.stored.set({ ...emptyRemote, secret: value.secret, url: value.url, relay: relay.origin })
    this.online = true
  }

  async confirm(user: number) {
    const state = this.stored.value
    await this.request(state.relay, state.secret, "/device/confirm", { telegram_id: user })

    if (this.controller.signal.aborted || this.stored.value.secret !== state.secret) return
    this.stored.set({ ...state, confirmed: true, url: "" })
  }

  async disconnect() {
    const state = this.stored.value
    // Stop local command execution immediately, including while the relay is unreachable.
    this.connection.abort()
    this.connection = new AbortController()
    this.stored.set({ ...emptyRemote })
    this.permissions.clear()
    this.online = false

    if (state.secret) await this.request(state.relay, state.secret, "/device", undefined, "DELETE").catch(() => undefined)
  }

  private async client() {
    const endpoint = this.endpoint()

    if (!endpoint?.local) throw new Error("Local OhMyCode service is unavailable")

    const { OpenCode } = await import("@opencode/client/promise")

    return OpenCode.make({ baseUrl: endpoint.url, headers: endpoint.headers })
  }

  private async request(relay: string, secret: string, path: string, body?: Reply | { name: string } | { telegram_id: number }, method?: string) {
    if (secret && method !== "DELETE" && this.stored.value.secret !== secret) throw new Error("Connection revoked")

    const headers = new Headers({ "Content-Type": "application/json" })

    if (secret) headers.set("Authorization", `Bearer ${secret}`)

    const response = await fetch(relay + Prefix + path, {
      method: method || (body ? "POST" : "GET"),
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(10000)]),
      redirect: "error",
    })

    if (!response.ok) {
      if (response.status === 401 && this.stored.value.secret === secret) this.stored.set({ ...emptyRemote })
      throw new Error(`Remote relay status ${response.status}`)
    }

    return response.json()
  }

  private async tick() {
    const state = this.stored.value

    try {
      if (state.secret) {
        const device = Schema.decodeUnknownSync(Device)(await this.request(state.relay, state.secret, "/device"))

        if (this.controller.signal.aborted || this.stored.value.secret !== state.secret) return

        if (state.confirmed !== device.confirmed || state.user !== device.telegram_id || state.name !== (device.telegram_name || "")) {
          this.stored.set({ ...this.stored.value, confirmed: device.confirmed, user: device.telegram_id, name: device.telegram_name || "" })
        }

        const client = await this.client()
        // Heartbeats are sent only while the local server actually answers.
        await client.server.info({ signal: this.controller.signal })
        const response = Schema.decodeUnknownSync(Commands)(await this.request(state.relay, state.secret, "/device/commands"))
        this.online = true

        for (const command of response.commands) {
          if (!this.live(state)) return
          let renewing = false

          const heartbeat = setInterval(() => {
            if (renewing || !this.live(state)) return
            renewing = true
            void client.server.info({ signal: AbortSignal.timeout(5000) })
              .then(() => this.live(state) ? this.request(state.relay, state.secret, `/device/heartbeat/${command.id}`, {}) : undefined)
              .catch(() => { this.online = false })
              .finally(() => { renewing = false })
          }, 5000)

          const reply = await this.execute(client, command, state)
            .catch((): Reply => ({ kind: "progress", finished: true, task: command.id, session: command.session, text: "Не удалось подтвердить выполнение команды. Проверьте /status перед повторной отправкой задачи." }))
            .finally(() => clearInterval(heartbeat))

          if (!this.live(state)) return
          await this.request(state.relay, state.secret, `/device/results/${command.id}`, reply)
        }

        if (device.confirmed && this.live(state)) await this.watch(client, state)
      }
    } catch {
      this.online = false
    } finally {
      if (!this.controller.signal.aborted) this.timer = setTimeout(() => void this.tick(), 2000)
    }
  }

  private live(state: State) {
    return !this.controller.signal.aborted && this.stored.value.secret === state.secret && this.stored.value.confirmed
  }

  private async attachment(client: OpenCodeClient, command: typeof RemoteCommand.Type, state: State) {
    const item = command.attachment
    const text = command.text || ""

    if (!item) return { text, files: [] }
    const root = this.storageRoot

    if (!root || item.id !== command.id) throw new Error("Invalid incoming attachment")
    const directory = join(root, "opencode", "telegram-inbox", command.id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const name = basename(item.name).replace(/[\x00-\x1f\\/]/g, "_") || "attachment"
    const file = join(directory, name === "." || name === ".." ? "attachment" : name)
    const existing = await readFile(file).catch(() => undefined)

    if (!existing) {
      const response = await fetch(`${state.relay}${Prefix}/device/attachments/${item.id}`, {
        headers: { authorization: `Bearer ${state.secret}` }, redirect: "error",
        signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(60000)]),
      })

      if (!response.ok || !response.body) throw new Error("Attachment download failed")
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0

      try {
        while (true) {
          const part = await reader.read()

          if (part.done) break
          size += part.value.length

          if (size > 20_000_000) throw new Error("Incoming attachment too large")
          chunks.push(part.value)
        }
      } finally { await reader.cancel() }

      await writeFile(file, Buffer.concat(chunks), { mode: 0o600 })
    }

    if (!this.live(state)) throw new Error("Connection revoked")

    if (item.voice) {
      const cached = await readFile(join(directory, "transcription.txt"), "utf8").catch(() => undefined)

      const result = cached === undefined ? Schema.decodeUnknownSync(Schema.Struct({ text: Schema.String, error: Schema.optional(Schema.String) }))((await client.rpc.call({
        rpcID: LamaAccountRpc.id, method: "transcribe", input: { file },
      }, { signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(130000)]) })).output) : { text: cached }

      if (result.error || !result.text.trim()) {
        await this.request(state.relay, state.secret, `/device/events/voice-error-${command.id}`, { text: result.error || "Не удалось разобрать речь. Отправьте задачу текстом." })

        throw new Error("Voice transcription unavailable")
      }

      await writeFile(join(directory, "transcription.txt"), result.text, { mode: 0o600 })
      await this.request(state.relay, state.secret, `/device/events/voice-${command.id}`, { kind: "stage", session: command.session, text: `Распознано голосовое:\n${result.text}`.slice(0, 23000) })

      return { text: [text, result.text].filter(Boolean).join("\n"), files: [] }
    }

    return {
      text: `${text || "Получен файл. Уточни, что пользователь хочет с ним сделать, если это не ясно из диалога."}\n\nПрикреплённый файл сохранён локально: ${JSON.stringify(file)}`,
      files: item.mime.startsWith("image/") || item.mime === "application/pdf" ? [{ uri: pathToFileURL(file).href, name }] : [],
    }
  }

  private async execute(client: OpenCodeClient, command: typeof RemoteCommand.Type, state: State): Promise<Reply> {
    const options = { signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(10000)]) }

    if (command.kind === "sessions") {
      const sessions = await client.session.list({ limit: 20, order: "desc", parentID: "null" }, options)

      return {
        kind: "sessions",
        sessions: sessions.data.map((row, index) => {
          const title = row.title?.trim() || "Новый диалог"
          const project = row.location?.directory?.split(/[\\/]/).filter(Boolean).at(-1)

          return { id: row.id, title: `${index + 1}. ${title.slice(0, 90)}${project ? ` · ${project.slice(0, 45)}` : ""}` }
        }),
      }
    }

    if (!command.session) throw new Error("Missing session")
    const session = await client.session.get({ sessionID: command.session }, options)

    if (!this.live(state)) throw new Error("Connection revoked")

    if (command.kind === "details") {
      const [recent, catalog, account, rate] = await Promise.all([
        client.message.list({ sessionID: session.id, limit: 100, order: "desc" }, options),
        client.model.list({ location: session.location }, options).catch(() => undefined),
        client.rpc.call({ rpcID: LamaAccountRpc.id, method: "get", input: {} }, options)
          .then((reply) => Schema.decodeUnknownSync(LamaAccount)(reply.output)).catch(() => undefined),
        fetch("https://ohmylama.ru/api/models/prices", { signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(3000)]), redirect: "error" })
          .then(async (response) => response.ok ? Schema.decodeUnknownSync(Schema.Struct({ usd_rub_rate: Schema.Finite.check(Schema.isGreaterThan(0)) }))(await response.json()).usd_rub_rate : undefined)
          .catch(() => undefined),
      ])

      const n = (value: number) => value.toLocaleString("ru-RU")
      const last = recent.data.find((message) => message.type === "assistant" && message.tokens)
      const tokens = last?.type === "assistant" ? last.tokens : undefined
      const model = last?.type === "assistant" ? catalog?.data.find((item) => item.id === last.model?.id && item.providerID === last.model?.providerID) : undefined
      const context = tokens ? tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write : undefined
      const total = session.tokens
      const cost = Number.isFinite(session.cost) ? `${session.cost.toFixed(5)} $${rate ? ` ≈ ${(session.cost * rate).toFixed(2)} ₽` : ""}` : "нет данных"

      return { text: [
        `📊 ${session.title || "Новый диалог"}`,
        `Модель: ${session.model?.id || "по умолчанию"}`,
        `Рассуждения: ${session.model?.variant || "по умолчанию"}`,
        "",
        "За весь диалог:",
        total ? `Вход: ${n(total.input)} · Выход: ${n(total.output)}\nРассуждения: ${n(total.reasoning)}\nКеш — чтение: ${n(total.cache.read)}, запись: ${n(total.cache.write)}` : "Токены: нет данных",
        `Стоимость по данным OhMyCode: ${cost}`,
        "Рубли — оценка по текущему курсу, не подтверждённое списание.",
        "",
        context === undefined ? "Контекст: нет данных" : `Контекст последнего ответа: ${n(context)}${model?.limit.context ? ` / ${n(model.limit.context)} (${Math.round(context / model.limit.context * 100)}%)` : ""}`,
        account?.status === "ready" ? `API-баланс сейчас: ${account.balance.toFixed(2)} ₽` : "API-баланс: временно недоступен",
      ].join("\n") }
    }

    if (command.kind === "models") {
      const catalog = await client.model.list({ location: session.location }, options)
      const models = catalog.data.filter((model) => model.enabled && model.providerID === "ohmylama")
      const page = Math.min(command.page || 0, Math.max(0, Math.ceil(models.length / 12) - 1))

      return {
        kind: "models", session: session.id, page, more: (page + 1) * 12 < models.length, create: command.create,
        text: `${command.create ? "Модель для нового диалога" : "Выберите модель"}. Сейчас: ${session.model?.id || "по умолчанию"}`,
        models: models.slice(page * 12, (page + 1) * 12).map((model) => ({ id: model.id, providerID: model.providerID, title: model.name })),
      }
    }

    if (command.kind === "variants") {
      const chosen = command.model || session.model

      if (!chosen) return { text: "Сначала выберите модель: /models" }
      const catalog = await client.model.list({ location: session.location }, options)
      const model = catalog.data.find((item) => item.enabled && item.providerID === "ohmylama" && item.id === chosen.id && item.providerID === chosen.providerID)

      if (!model) return { text: "Модель больше недоступна. Откройте /models." }

      if (!model.variants.length && command.model) return this.execute(client, { ...command, kind: command.create ? "new" : "model", model: { id: model.id, providerID: model.providerID } }, state)

      return {
        kind: "variants", session: session.id, create: command.create, model: { id: model.id, providerID: model.providerID },
        variants: model.variants.map((variant) => variant.id),
        text: model.variants.length ? `Глубина рассуждений · ${model.name}. Сейчас: ${session.model?.id === model.id ? session.model.variant || "по умолчанию" : "по умолчанию"}` : "У этой модели нет переключателя глубины рассуждений.",
      }
    }

    if (command.model) {
      const catalog = await client.model.list({ location: session.location }, options)

      if (!catalog.data.some((model) => model.enabled && model.id === command.model?.id && model.providerID === command.model.providerID && model.providerID === "ohmylama" && (!command.model.variant || model.variants.some((variant) => variant.id === command.model?.variant)))) {
        return { text: "Модель больше недоступна. Откройте /models и выберите другую." }
      }
    }

    if (command.kind === "model") {
      if (!command.model) throw new Error("Missing model")
      const active = await client.session.active(options)
      const inbox = await client.session.inbox.list({ sessionID: session.id }, options)

      if (active[session.id] || inbox.length) return { text: "Дождитесь завершения задач или остановите их перед сменой модели." }

      if (!this.live(state)) throw new Error("Connection revoked")
      await client.session.switchModel({ sessionID: session.id, model: command.model }, options)

      return { text: `Модель диалога «${session.title}»: ${command.model.id}. Рассуждения: ${command.model.variant || "по умолчанию"}.` }
    }

    if (command.kind === "prompt") {
      const id = `msg_remote_${command.id}`
      // Core prompt admission is idempotent by message id, including after reconnect.
      const input = await this.attachment(client, command, state)

      if (!this.live(state)) throw new Error("Connection revoked")
      await client.session.prompt({ sessionID: session.id, id, ...input, delivery: "queue" }, {
        signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(30000)]),
      })

      if (!this.live(state)) return {}

      if (!this.stored.value.watched.some((row) => row.prompt === id)) {
        this.stored.set({ ...this.stored.value, watched: [...this.stored.value.watched, { session: session.id, prompt: id, started: Date.now() }] })
      }

      return { kind: "progress", task: command.id, session: session.id, text: "Задача принята. Результат пришлю сюда." }
    }

    if (command.kind === "stop") {
      if (command.task) {
        const target = `msg_remote_${command.task}`
        const watched = this.stored.value.watched.find((row) => row.session === session.id && row.prompt === target)

        if (!watched) return { text: "Эта задача уже завершена. Новые задачи не остановлены." }
        const inbox = await client.session.inbox.list({ sessionID: session.id }, options)

        if (inbox.some((item) => item.id === target)) {
          await client.session.inbox.cancel({ sessionID: session.id, inboxID: target }, options)
        } else {
          const recent = await client.message.list({ sessionID: session.id, limit: 100, order: "desc" }, options)
          const latest = recent.data.find((row) => row.type === "user")

          if (latest?.id !== target) return { text: "Задача уже сменилась. Текущую работу не останавливаю." }
          await client.session.interrupt({ sessionID: session.id, resume: false }, options)
        }

        await this.request(state.relay, state.secret, `/device/events/stopped-${target}`, {
          kind: "progress", finished: true, task: command.task, session: session.id, text: "Остановлено пользователем.",
        })

        if (this.live(state)) this.stored.set({ ...this.stored.value, watched: this.stored.value.watched.filter((row) => row.prompt !== target) })

        return { text: `Задача остановлена: ${session.title}.` }
      }

      await client.session.interrupt({ sessionID: session.id, resume: false }, options)
      // Cancel queued Telegram prompts too; interrupt alone does not empty the inbox.
      const inbox = await client.session.inbox.list({ sessionID: session.id }, options)

      for (const item of inbox) {
        if (item.id.startsWith("msg_remote_")) await client.session.inbox.cancel({ sessionID: session.id, inboxID: item.id }, options)
      }

      for (const watched of this.stored.value.watched.filter((row) => row.session === session.id)) {
        await this.request(state.relay, state.secret, `/device/events/stopped-${watched.prompt}`, {
          kind: "progress", finished: true, task: watched.prompt.replace("msg_remote_", ""), session: session.id, text: "Остановлено пользователем.",
        })
      }

      if (this.live(state)) this.stored.set({ ...this.stored.value, watched: this.stored.value.watched.filter((row) => row.session !== session.id) })

      return { text: `Работа остановлена: ${session.title}.` }
    }

    if (command.kind === "permission") {
      if (!command.request || !command.decision) throw new Error("Invalid permission reply")
      await client.permission.reply({ sessionID: session.id, requestID: command.request, decision: command.decision }, options)

      return { text: command.decision === "once" ? "Действие разрешено один раз." : "Действие отклонено." }
    }

    if (command.kind === "new") {
      const created = await client.session.create({ id: `ses_remote_${command.id}`, location: session.location, model: command.model || session.model, agent: session.agent, title: "Telegram" }, options)

      return { kind: "selected", session: created.id, text: `Новый диалог создан в том же проекте. Модель: ${command.model?.id || session.model?.id || "по умолчанию"}. Рассуждения: ${command.model?.variant || "по умолчанию"}. Отправьте задачу.` }
    }

    const pending = await client.permission.list({ sessionID: session.id }, options)

    for (const permission of pending) await this.ask(state, session.id, permission, `${command.id}-${permission.id}`)
    const active = await client.session.active(options)
    const transcript = await client.session.export({ sessionID: session.id, sanitize: false }, options)
    const last = transcript.messages.findLast((row) => row.type === "assistant")
    const text = last?.type === "assistant" ? last.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") : ""

    return { text: `${session.title}\n${active[session.id] ? "Работает" : "Ожидает задачу"}\n\n${text}`.slice(0, 23000) }
  }

  private async ask(state: State, session: string, permission: PermissionListOutput[number], identity: string) {
    await this.request(state.relay, state.secret, `/device/events/${identity}`, {
      kind: "permission", session, request: permission.id,
      text: `Требуется разрешение\n${permission.action}\n${permission.resources.join("\n")}\n${permission.message || ""}`.slice(0, 23000),
    })
  }

  private async stages(messages: ReadonlyArray<SessionMessageInfo>, prompt: string, state: State) {
    for (const [index, message] of messages.entries()) {
      if (message.type !== "assistant" || (!message.time?.streamed && !message.time?.completed)) continue
      // A tool step or a subsequent assistant response identifies commentary, not the final answer.

      if (!message.content.some((item) => item.type === "tool") && !messages.slice(index + 1).some((row) => row.type === "assistant")) continue
      const watched = this.stored.value.watched.find((row) => row.prompt === prompt)

      if (!watched || watched.announced?.includes(message.id)) continue
      const text = message.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n").trim()

      if (!text) continue

      if (!this.live(state)) return
      await this.request(state.relay, state.secret, `/device/events/stage-${prompt}-${message.id}`, { kind: "stage", session: watched.session, text: `Этап работы\n\n${text}`.slice(0, 23000) })

      if (!this.live(state)) return
      this.stored.set({ ...this.stored.value, watched: this.stored.value.watched.map((row) => row.prompt === prompt ? { ...row, announced: [...(row.announced || []), message.id] } : row) })
    }
  }

  private async watch(client: OpenCodeClient, state: State) {
    if (!this.stored.value.watched.length) return
    const options = { signal: AbortSignal.any([this.controller.signal, this.connection.signal, AbortSignal.timeout(10000)]) }
    const active = await client.session.active(options)

    for (const watched of this.stored.value.watched) {
      if (!this.live(state)) return
      const pending = await client.permission.list({ sessionID: watched.session }, options)

      for (const permission of pending) {
        if (this.permissions.has(permission.id)) continue
        await this.ask(state, watched.session, permission, permission.id)
        this.permissions.add(permission.id)
      }

      const inbox = await client.session.inbox.list({ sessionID: watched.session }, options)
      const queued = inbox.some((row) => row.id === watched.prompt)

      if ((active[watched.session] || pending.length) && !queued && Date.now() - (this.activityTimes.get(watched.prompt) || 0) < 5000) continue
      let activity = ""

      if ((active[watched.session] || pending.length) && !queued) {
        const recent = await client.message.list({ sessionID: watched.session, limit: 100, order: "desc" }, options)
        const messages = recent.data.toReversed()
        const start = messages.findIndex((row) => row.id === watched.prompt)
        const next = messages.findIndex((row, index) => index > start && row.type === "user")

        if (start >= 0) {
          const task = messages.slice(start + 1, next < 0 ? undefined : next)
          activity = remoteActivity(task)
          await this.stages(task, watched.prompt, state)
        }

        this.activityTimes.set(watched.prompt, Date.now())
      }

      const phase = pending.length ? "Требуется разрешение. Используйте кнопки под запросом или /status." : queued ? "В очереди. Агент завершает предыдущую задачу." : `Агент работает…${activity ? `\n${activity}` : ""}`

      if ((active[watched.session] || pending.length || queued) && this.phases.get(watched.prompt) !== phase) {
        await this.request(state.relay, state.secret, `/device/events/phase-${watched.prompt}-${Date.now()}`, {
          kind: "progress", task: watched.prompt.replace("msg_remote_", ""), session: watched.session, text: phase,
        })
        this.phases.set(watched.prompt, phase)
      }

      if (active[watched.session] || pending.length || queued || Date.now() - watched.started < 3000) continue
      const transcript = await client.session.export({ sessionID: watched.session, sanitize: false }, options)
      const start = transcript.messages.findIndex((row) => row.id === watched.prompt)

      if (start < 0) continue // A queued prompt has not been admitted into the transcript yet.
      const next = transcript.messages.findIndex((row, index) => index > start && row.type === "user")
      const messages = transcript.messages.slice(start + 1, next < 0 ? undefined : next)

      if (!messages.some((row) => row.type === "idle")) continue
      await this.stages(messages, watched.prompt, state)
      const announced = this.stored.value.watched.find((row) => row.prompt === watched.prompt)?.announced || []
      const text = messages.flatMap((row) => row.type === "assistant" && !announced.includes(row.id) ? row.content.flatMap((item) => item.type === "text" ? [item.text] : []) : []).join("\n\n")
      await this.request(state.relay, state.secret, `/device/events/${watched.prompt}`, { task: watched.prompt.replace("msg_remote_", ""), session: watched.session, text: `${transcript.info.title}\n\n${text || (announced.length ? "Задача завершена. Этапы работы отправлены выше." : "Задача завершена без текстового ответа. Подробности доступны в OhMyCode.")}`.slice(0, 23000) })

      if (!this.live(state)) return
      this.phases.delete(watched.prompt)
      this.activityTimes.delete(watched.prompt)
      this.stored.set({ ...this.stored.value, watched: this.stored.value.watched.filter((row) => row.prompt !== watched.prompt) })
    }
  }
}
