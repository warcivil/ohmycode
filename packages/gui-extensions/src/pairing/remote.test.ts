import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, request as httpRequest } from "node:http"
import { once } from "node:events"
import { afterEach, describe, expect, test } from "bun:test"
import { RemoteControl } from "./remote"
import { emptyRemote, RemoteState } from "./remote-contract"
import { Schema } from "effect"

const Prompt = Schema.Struct({ id: Schema.String, text: Schema.String, delivery: Schema.String })

const Result = Schema.Struct({ text: Schema.optional(Schema.String) })

describe("remote connector's HTTP boundary", () => {
  const cleanup: (() => void)[] = []
  afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

  test("incoming screenshot and voice become prompts without sending credentials to relay", async () => {
    const root = await mkdtemp(join(tmpdir(), "remote-incoming-"))
    cleanup.push(() => { void rm(root, { recursive: true, force: true }) })
    const prompts: { text: string; files: readonly { uri: string }[] }[] = []
    let acknowledged = 0
    let transcriptions = 0

    const server = await serve(async (request) => {
      const path = new URL(request.url).pathname

      if (path.includes("/ohmycode-remote/")) {
        expect(request.headers.get("authorization")).toBe("Bearer device-only")

        if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

        if (path.endsWith("/commands")) return Response.json({ commands: acknowledged >= 2 ? [] : [{
          id: acknowledged === 0 ? "tg-801" : "tg-802", kind: "prompt", session: "ses_test", text: "Посмотри",
          attachment: { id: acknowledged === 0 ? "tg-801" : "tg-802", name: acknowledged === 0 ? "screen.png" : "voice.ogg", mime: acknowledged === 0 ? "image/png" : "audio/ogg", voice: acknowledged > 0 },
        }] })

        if (path.includes("/attachments/")) return new Response("image or voice bytes")

        if (path.includes("/results/")) acknowledged++

        return Response.json({ ok: true })
      }

      if (path.includes("/api/rpc/")) {
        transcriptions++

        return Response.json({ output: { text: "Создай таблицу" } })
      }

      if (path.endsWith("/prompt")) {
        prompts.push(Schema.decodeUnknownSync(Schema.Struct({ text: Schema.String, files: Schema.Array(Schema.Struct({ uri: Schema.String })) }))(await request.json()))

        return Response.json({ data: {} })
      }

      if (path === "/api/session/ses_test") return Response.json({ data: { id: "ses_test", title: "Test" } })

      if (path === "/api/session/active") return Response.json({ data: { ses_test: { type: "running" } } })

      if (path.endsWith("/message") || path.endsWith("/permission") || path.endsWith("/inbox")) return Response.json({ data: [] })

      return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: { authorization: "Basic local-only" } }), root)
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 8000

    while (acknowledged < 2 && Date.now() < deadline) await Bun.sleep(20)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]?.files[0]?.uri).toContain("/telegram-inbox/tg-801/screen.png")
    expect(prompts[1]?.text).toContain("Создай таблицу")
    expect(prompts[1]?.files).toEqual([])
    expect(transcriptions).toBe(1)
    expect(await readFile(join(root, "opencode", "telegram-inbox", "tg-802", "transcription.txt"), "utf8")).toBe("Создай таблицу")
    control.close()
    await Bun.sleep(100)
  }, 10000)

  test("prompt identity survives redelivery; disconnect stops commands and hides credentials", async () => {
    const prompts: string[] = []
    const phases: string[] = []
    const replies: string[] = []
    const sidecarHeaders: string[] = []
    const relayHeaders: string[] = []

    const server = await serve(async (request) => {
        const path = new URL(request.url).pathname

        if (path.startsWith("/api/ohmycode-remote")) {
          relayHeaders.push(request.headers.get("authorization") || "")

          if (request.method === "DELETE") return Response.json({ ok: true })

          if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

          if (path.endsWith("/commands")) return Response.json({ commands: [{ id: "tg-15", kind: "prompt", session: "ses_test", text: "Hello" }] })

          if (path.includes("/events/")) {
            phases.push(Schema.decodeUnknownSync(Result)(await request.json()).text || "")

            return Response.json({ ok: true })
          }

          if (path.includes("/results/")) {
            replies.push(Schema.decodeUnknownSync(Result)(await request.json()).text || "")

            return Response.json({ ok: true })
          }
        }

        sidecarHeaders.push(request.headers.get("authorization") || "")

        if (path.endsWith("/message")) return Response.json({ data: [
          { id: "msg_tools", type: "assistant", time: { streamed: 1 }, content: [
            { type: "text", text: "Сделаю отдельную версию игры." },
            { type: "tool", name: "execute", state: { status: "running", metadata: { toolCalls: [
              { tool: "browser.tabs.open", status: "completed", input: { password: "must-not-forward" } },
            ] } } },
          ] },
          { id: "msg_remote_tg-15", type: "user", content: [] },
        ] })

        if (path === "/api/session/ses_test") return Response.json({ data: { id: "ses_test", title: "Test" } })

        if (path.endsWith("/prompt")) {
          const body = Schema.decodeUnknownSync(Prompt)(await request.json())
          prompts.push(body.id)
          expect(body.text).toBe("Hello")
          expect(body.delivery).toBe("queue")

          return Response.json({ data: {} })
        }

        if (path === "/api/session/active") return Response.json({ data: { ses_test: { type: "running" } } })

        if (path.endsWith("/permission") || path.endsWith("/inbox")) return Response.json({ data: [] })

        return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: { authorization: "Basic local-only" } }))
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 7000

    while (replies.length < 2 && Date.now() < deadline) await Bun.sleep(20)
    expect(prompts).toEqual(["msg_remote_tg-15", "msg_remote_tg-15"])
    expect(stored.value.watched).toHaveLength(1)
    expect(phases.join(" ")).toContain("Открыл браузер")
    expect(phases.filter((text) => text.includes("Сделаю отдельную версию игры."))).toHaveLength(1)
    expect(stored.value.watched[0]?.announced).toEqual(["msg_tools"])
    expect(phases.join(" ")).not.toContain("must-not-forward")
    expect(relayHeaders.every((value) => value === "Bearer device-only")).toBe(true)
    expect(sidecarHeaders.every((value) => value === "Basic local-only")).toBe(true)
    expect(control.status().name).toBe("owner")
    expect(JSON.stringify(control.status())).not.toContain("device-only")
    await control.disconnect()
    await Bun.sleep(2200)
    expect(prompts).toHaveLength(2)
    expect(control.status().state).toBe("off")
  }, 12000)

  test("revoking during local session lookup prevents a late prompt", async () => {
    const calls: string[] = []
    const lookup = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()

    const server = await serve(async (request) => {
        const path = new URL(request.url).pathname
        calls.push(path)

        if (request.method === "DELETE") return Response.json({ ok: true })

        if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

        if (path.endsWith("/commands")) return Response.json({ commands: [{ id: "tg-20", kind: "prompt", session: "ses_test", text: "Must not execute" }] })

        if (path === "/api/session/ses_test") {
          lookup.resolve()
          await release.promise

          return Response.json({ data: { id: "ses_test" } })
        }

        return Response.json({ urls: [] })
    })

    cleanup.push(() => { release.resolve(); server.stop(true) })

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: {} }))
    cleanup.push(() => control.close())
    control.start()
    await lookup.promise
    await control.disconnect()
    release.resolve()
    await Bun.sleep(100)
    expect(calls.some((path) => path.endsWith("/prompt"))).toBe(false)
    expect(control.status().state).toBe("off")
  })
  test("model picker paginates the live catalog, validates choices and refuses switching a busy session", async () => {
    const replies: unknown[] = []
    const switches: unknown[] = []
    const creations: unknown[] = []
    const catalog = Array.from({ length: 15 }, (_, id) => ({ id: `model-${id}`, name: `Model ${id}`, providerID: "ohmylama", enabled: true, variants: [{ id: "low" }, { id: "high" }] }))

    const server = await serve(async (request) => {
      const path = new URL(request.url).pathname

      if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

      if (path.endsWith("/commands")) return Response.json({ commands: [
        { id: "tg-51", kind: "models", session: "ses_test", page: 1, create: true },
        { id: "tg-52", kind: "model", session: "ses_test", model: { id: "missing", providerID: "ohmylama" } },
        { id: "tg-53", kind: "model", session: "ses_busy", model: { id: "model-1", providerID: "ohmylama" } },
        { id: "tg-54", kind: "model", session: "ses_test", model: { id: "model-2", providerID: "ohmylama", variant: "high" } },
        { id: "tg-55", kind: "new", session: "ses_test", model: { id: "model-3", providerID: "ohmylama" } },
        { id: "tg-56", kind: "variants", session: "ses_test", model: { id: "model-1", providerID: "ohmylama" }, create: true },
        { id: "tg-57", kind: "model", session: "ses_test", model: { id: "model-1", providerID: "ohmylama", variant: "unsupported" } },
      ] })

      if (path.includes("/results/")) {
        replies.push(await request.json())

        return Response.json({ ok: true })
      }

      if (path === "/api/session/ses_test" || path === "/api/session/ses_busy") return Response.json({ data: { id: path.split("/").at(-1), title: "Test", location: { directory: "/project" }, model: { id: "old", providerID: "ohmylama" } } })

      if (path === "/api/model") return Response.json({ data: [...catalog, { id: "hidden", providerID: "ohmylama", enabled: false }] })

      if (path === "/api/session/active") return Response.json({ data: { ses_busy: { type: "running" } } })

      if (path.endsWith("/inbox")) return Response.json({ data: [] })

      if (path.endsWith("/model") && request.method === "POST") {
        switches.push(await request.json())

        return new Response(null, { status: 204 })
      }

      if (path === "/api/session" && request.method === "POST") {
        creations.push(await request.json())

        return Response.json({ data: { id: "ses_remote_tg-55" } })
      }

      return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: {} }))
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 4000

    while (replies.length < 7 && Date.now() < deadline) await Bun.sleep(20)
    control.close()
    expect(replies).toHaveLength(7)
    expect(replies[5]).toMatchObject({ kind: "variants", variants: ["low", "high"], create: true })
    expect(replies[0]).toMatchObject({ kind: "models", page: 1, more: false, create: true, models: [{ id: "model-12" }, { id: "model-13" }, { id: "model-14" }] })
    expect(switches).toEqual([{ model: { id: "model-2", providerID: "ohmylama", variant: "high" } }])
    expect(creations[0]).toMatchObject({ id: "ses_remote_tg-55", location: { directory: "/project" }, model: { id: "model-3", providerID: "ohmylama" } })
    await Bun.sleep(100)
  })

  test("task stop cancels only its queued prompt and an old button cannot interrupt a newer turn", async () => {
    const paths: string[] = []
    let replies = 0

    const server = await serve(async (request) => {
      const path = new URL(request.url).pathname
      paths.push(`${request.method} ${path}`)

      if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

      if (path.endsWith("/commands")) return Response.json({ commands: [
        { id: "tg-41", kind: "stop", session: "ses_test", task: "tg-3" },
        { id: "tg-42", kind: "stop", session: "ses_test", task: "tg-2" },
      ] })

      if (path.includes("/results/")) {
        replies++

        return Response.json({ ok: true })
      }

      if (path.includes("/events/")) return Response.json({ ok: true })

      if (path === "/api/session/ses_test") return Response.json({ data: { id: "ses_test", title: "Test" } })

      if (path.endsWith("/inbox")) return Response.json({ data: [{ id: "msg_remote_tg-3" }, { id: "msg_remote_tg-4" }] })

      if (path.endsWith("/message")) return Response.json({ data: [{ id: "msg_newer", type: "user", content: [] }] })

      if (request.method === "DELETE") return new Response(null, { status: 204 })

      return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true,
        watched: [2, 3].map((id) => ({ session: "ses_test", prompt: `msg_remote_tg-${id}`, started: Date.now() })),
      }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: {} }))
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 4000

    while (replies < 2 && Date.now() < deadline) await Bun.sleep(20)
    control.close()
    expect(replies).toBe(2)
    expect(paths).toContain("DELETE /api/session/ses_test/inbox/msg_remote_tg-3")
    expect(paths).not.toContain("DELETE /api/session/ses_test/inbox/msg_remote_tg-4")
    expect(paths).not.toContain("POST /api/session/ses_test/interrupt")
    await Bun.sleep(100)
  })

  test("stop cancels only Telegram inbox entries and permissions remain one-shot", async () => {
    const paths: string[] = []
    const decisions: string[] = []
    const results: string[] = []

    const server = await serve(async (request) => {
      const path = new URL(request.url).pathname
      paths.push(`${request.method} ${path}`)

      if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

      if (path.endsWith("/commands")) return Response.json({ commands: [
        { id: "tg-31", kind: "stop", session: "ses_test" },
        { id: "tg-32", kind: "permission", session: "ses_test", request: "per_test", decision: "once" },
      ] })

      if (path.includes("/results/")) {
        results.push(path)

        return Response.json({ ok: true })
      }

      if (path === "/api/session/ses_test") return Response.json({ data: { id: "ses_test", title: "Test" } })

      if (path.endsWith("/interrupt")) return Response.json({ interrupted: true })

      if (path.endsWith("/inbox")) return Response.json({ data: [{ id: "msg_remote_tg-3" }, { id: "msg_local_4" }] })

      if (request.method === "DELETE") return new Response(null, { status: 204 })

      if (path.endsWith("/reply")) {
        decisions.push(await request.text())

        return new Response(null, { status: 204 })
      }

      return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: {} }))
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 4000

    while (results.length < 2 && Date.now() < deadline) await Bun.sleep(20)
    control.close()
    expect(results).toHaveLength(2)
    expect(paths).toContain("POST /api/session/ses_test/interrupt")
    expect(paths).toContain("DELETE /api/session/ses_test/inbox/msg_remote_tg-3")
    expect(paths).not.toContain("DELETE /api/session/ses_test/inbox/msg_local_4")
    expect(decisions).toEqual(['{"decision":"once"}'])
  })

  test("status and completed tasks deliver assistant text, not sanitized placeholders", async () => {
    const replies: string[] = []

    const server = await serve(async (request) => {
      const url = new URL(request.url)
      const path = url.pathname

      if (path.endsWith("/device")) return Response.json({ confirmed: true, telegram_id: 10, telegram_name: "owner" })

      if (path.endsWith("/commands")) return Response.json({ commands: [{ id: "tg-40", kind: "status", session: "ses_test" }] })

      if (path.includes("/results/") || path.includes("/events/")) {
        replies.push(Schema.decodeUnknownSync(Result)(await request.json()).text || "")

        return Response.json({ ok: true })
      }

      if (path === "/api/session/ses_test") return Response.json({ data: { id: "ses_test", title: "Приветствие" } })

      if (path.endsWith("/permission") || path.endsWith("/inbox")) return Response.json({ data: [] })

      if (path.endsWith("/active")) return Response.json({ data: {} })

      if (path.endsWith("/export")) {
        const sanitized = url.searchParams.get("sanitize") === "true"

        return Response.json({ data: {
          info: { title: sanitized ? "[redacted:session-title]" : "Приветствие" },
          messages: [
            { id: "msg_remote_tg-39", type: "user", content: [] },
            { id: "msg_stage", type: "assistant", time: { completed: 1 }, content: [{ type: "text", text: "Already delivered stage" }] },
            { id: "msg_answer", type: "assistant", content: [
              { type: "text", text: sanitized ? "[redacted:text]" : "Нормально, готов к делу." },
              { type: "reasoning", text: "Private reasoning" },
            ] },
            { id: "msg_idle", type: "idle" },
            { id: "msg_next", type: "user", content: [] },
            { id: "msg_next_answer", type: "assistant", content: [{ type: "text", text: "Different task answer" }] },
          ],
        } })
      }

      return Response.json({ urls: [] })
    })

    cleanup.push(() => server.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: server.url.origin, confirmed: true,
        watched: [{ session: "ses_test", prompt: "msg_remote_tg-39", started: Date.now() - 5000, announced: ["msg_stage"] }],
      }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => ({ url: server.url.origin, local: true, headers: {} }))
    cleanup.push(() => control.close())
    control.start()
    const deadline = Date.now() + 4000

    while (replies.length < 2 && Date.now() < deadline) await Bun.sleep(20)
    control.close()
    expect(replies).toHaveLength(2)
    expect(replies[0]).toContain("Different task answer")
    expect(replies[1]).toContain("Нормально, готов к делу.")
    expect(replies[1]).not.toContain("Different task answer")
    expect(replies[1]).not.toContain("Already delivered stage")
    expect(replies.join(" ")).not.toContain("redacted")
    expect(replies.join(" ")).not.toContain("Private reasoning")
    expect(stored.value.watched).toHaveLength(0)
  })

  test("file bridge authenticates callers, bounds files and rejects unlinked sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ohmycode-transfer-"))
    const uploaded: string[] = []

    const relay = await serve(async (request) => {
      expect(request.headers.get("authorization")).toBe("Bearer device-only")
      uploaded.push(await request.text())

      return Response.json({ sent: true })
    })

    cleanup.push(() => relay.stop(true))

    const stored = {
      value: Schema.decodeUnknownSync(RemoteState)({ ...emptyRemote, secret: "device-only", relay: relay.url.origin, confirmed: true,
        watched: [{ session: "ses_test", prompt: "msg_remote_tg-1", started: Date.now() }],
      }),
      set(value: typeof RemoteState.Type) { this.value = value },
    }

    const control = new RemoteControl(stored, () => undefined)
    cleanup.push(() => control.close())

    try {
      await control.listen(directory)
      const bridge = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String, secret: Schema.String }))(JSON.parse(await readFile(join(directory, "opencode/telegram-bridge.json"), "utf8")))
      const file = join(directory, "report.txt")
      await writeFile(file, "Actual file bytes")

      const send = (session: string, secret = bridge.secret) => new Promise<number>((resolve, reject) => {
        const request = httpRequest(bridge.url, {
          method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        }, (response) => { response.resume(); resolve(response.statusCode || 0) })

        request.on("error", reject)
        request.end(JSON.stringify({ session, id: "tool_1", path: file }))
      })

      expect(await send("ses_test", "wrong")).toBe(403)
      expect(await send("ses_other")).toBe(400)
      expect(await send("ses_test")).toBe(200)
      expect(uploaded).toEqual(["Actual file bytes"])
      await writeFile(file, Buffer.alloc(12 * 1024 * 1024, 65))
      expect(await send("ses_test")).toBe(200)
      expect(uploaded[1]?.length).toBe(12 * 1024 * 1024)
      await writeFile(file, Buffer.alloc(50_000_000 + 1))
      expect(await send("ses_test")).toBe(400)
      stored.set({ ...emptyRemote })
      expect(await send("ses_test")).toBe(400)
      expect(uploaded).toHaveLength(2)
    } finally {
      control.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

})

// GUI tests preload happy-dom; node:http accepts its Response objects without replacing globals.
async function serve(handler: (request: Request) => Promise<Response>) {
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-file-name")

    if (request.method === "OPTIONS") { response.writeHead(204); response.end();

 return }

    const chunks: Buffer[] = []

    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const headers = new Headers()

    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value)
    }

    const result = await handler(new Request(`http://127.0.0.1${request.url}`, {
      method: request.method,
      headers,
      body: body.length ? body : undefined,
    }))

    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(await result.text())
  })

  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address())

  return {
    url: new URL(`http://127.0.0.1:${address.port}`),
    stop(_force: boolean) { server.closeAllConnections(); server.close() },
  }
}
