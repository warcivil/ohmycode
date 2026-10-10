import { createServer } from "node:http"
import { once } from "node:events"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Schema } from "effect"

export const FileRequest = Schema.Struct({
  session: Schema.String.check(Schema.isPattern(/^ses_[a-zA-Z0-9_-]+$/)),
  id: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+$/), Schema.isMaxLength(150)),
  path: Schema.String.check(Schema.isMaxLength(4096)),
})

export async function fileBridge(directory: string, send: (input: typeof FileRequest.Type) => Promise<void>) {
  const secret = randomBytes(32).toString("hex")

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/send" || request.headers.authorization !== `Bearer ${secret}`) {
      response.writeHead(403).end()

      return
    }

    try {
      const parts: Buffer[] = []
      let size = 0

      for await (const part of request) {
        size += part.length

        if (size > 8192) {
          response.writeHead(413).end()

          return
        }

        parts.push(Buffer.from(part))
      }

      const input = Schema.decodeUnknownSync(FileRequest)(JSON.parse(Buffer.concat(parts).toString()))
      await send(input)
      response.writeHead(200, { "content-type": "application/json" }).end('{"sent":true}')
    } catch {
      response.writeHead(400).end("File could not be sent. Check Telegram connection, file permissions and the 50 MB limit.")
    }
  })

  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, "telegram-bridge.json"), JSON.stringify({ url: `http://127.0.0.1:${address.port}/send`, secret }), { mode: 0o600 })

  return () => { server.closeAllConnections(); server.close() }
}
