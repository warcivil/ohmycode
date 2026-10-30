import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Path } from "@opencode/util/global"

const directory = () => path.join(Path.data, "lama-device")
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")

export async function devicePublicKey(folder = directory()) {
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const file = path.join(folder, "signing.pem")
  const existing = await readFile(file, "utf8").catch(() => undefined)
  if (!existing) {
    const generated = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" })
    await writeFile(file, generated, { flag: "wx", mode: 0o600 }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error
    })
  }
  const privateKey = await readFile(file, "utf8")
  return createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(-32).toString("base64")
}

export async function bindDeviceKey(key: string, folder = directory()) {
  await writeFile(path.join(folder, hash(key)), "bound", { mode: 0o600 })
}

export async function signDeviceRequest(request: Request, folder = directory()) {
  const url = new URL(request.url)
  if (url.origin !== "https://ohmylama.ru" || !url.pathname.startsWith("/v1/")) return request
  const key = request.headers.get("authorization")?.replace(/^Bearer /i, "")
  if (!key || !(await readFile(path.join(folder, hash(key)), "utf8").catch(() => undefined))) return request
  const privateKey = await readFile(path.join(folder, "signing.pem"), "utf8")
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomBytes(16).toString("hex")
  const body = new Uint8Array(await request.clone().arrayBuffer())
  const payload = ["ohmycode-v1", timestamp, nonce, request.method.toUpperCase(), url.pathname + url.search, hash(body), hash(key)].join("\n")
  const headers = new Headers(request.headers)
  headers.set("x-ohmycode-time", timestamp)
  headers.set("x-ohmycode-nonce", nonce)
  headers.set("x-ohmycode-signature", sign(null, Buffer.from(payload), privateKey).toString("base64"))
  return new Request(request, { headers, redirect: "error" })
}

export async function deviceFetch(input: string | URL | Request, init?: RequestInit) {
  return fetch(await signDeviceRequest(input instanceof Request ? new Request(input, init) : new Request(String(input), init)))
}
