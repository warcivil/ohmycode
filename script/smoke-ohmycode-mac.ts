import { $ } from "bun"
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"

if (process.platform !== "darwin") throw new Error("macOS smoke requires macOS")
const root = join(import.meta.dirname, "..")
const app = join(root, "packages/desktop/dist", process.arch === "arm64" ? "mac-arm64" : "mac", "OhMyCode.app")
const binary = join(app, "Contents/Resources/opencode-cli")
const version = (await Bun.file(join(app, "Contents/Resources/opencode-cli.version")).text()).trim()
const architecture = process.arch === "arm64" ? "arm64" : "x86_64"
for (const file of [binary, join(app, "Contents/MacOS/OhMyCode")]) {
  if (!(await $`lipo -archs ${file}`.text()).trim().split(/\s+/).includes(architecture)) throw new Error("Wrong packaged architecture")
}
await $`codesign --verify --deep --strict ${app}`
if ((await $`${binary} --version`.text()).trim() !== `opencode v${version}`) throw new Error("Bundled core version mismatch")
const home = await mkdtemp(join(tmpdir(), "ohmycode-mac-smoke-"))
const secret = randomBytes(32).toString("hex")
const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, "data"), XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"), XDG_STATE_HOME: join(home, "state"), OPENCODE_PASSWORD: secret }
const server = Bun.spawn([binary, "serve", "--hostname", "127.0.0.1", "--port", "49587"], { env, cwd: home, stdout: "ignore", stderr: "ignore" })
try {
  const headers = { Authorization: `Basic ${Buffer.from(`opencode:${secret}`).toString("base64")}` }
  const deadline = Date.now() + 90000
  while (true) {
    if (server.exitCode !== null) throw new Error("Packaged core exited before ready")
    const result = await fetch("http://127.0.0.1:49587/api/info", { headers, signal: AbortSignal.timeout(1000) }).catch(() => undefined)
    if (result?.ok) {
      if ((await result.json()).version !== version) throw new Error("Running core version mismatch")
      break
    }
    if (Date.now() > deadline) throw new Error("Packaged core readiness timeout")
    await Bun.sleep(1000)
  }
  if ((await fetch("http://127.0.0.1:49587/api/info")).ok) throw new Error("Core accepted unauthenticated request")
  console.log(`PASS ${process.arch}: signed application structure, native binaries, core ${version}, authenticated API`)
} finally {
  server.kill("SIGTERM")
  const timer = setTimeout(() => server.kill("SIGKILL"), 10000)
  await server.exited
  clearTimeout(timer)
  await rm(home, { recursive: true, force: true })
}
