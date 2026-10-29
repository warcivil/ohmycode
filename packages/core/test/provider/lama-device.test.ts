import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash, createPublicKey, verify } from "node:crypto"
import { bindDeviceKey, devicePublicKey, signDeviceRequest } from "../../src/plugin/provider/lama-device"

test("device proof binds body and key, with fresh nonces and no third-party leakage", async () => {
 const folder = await mkdtemp(path.join(tmpdir(), "lama-proof-"))
 try {
  const publicKey = await devicePublicKey(folder)
  expect(await devicePublicKey(folder)).toBe(publicKey)
  const key = "sk-lama-test"
  const request = new Request("https://ohmylama.ru/v1/chat/completions", { method:"POST", headers:{authorization:"Bearer " + key}, body:'{"model":"gpt-6.1-sol"}' })
  expect((await signDeviceRequest(request,folder)).headers.has("x-ohmycode-signature")).toBe(false)
  await bindDeviceKey(key,folder)
  const signed = await signDeviceRequest(request,folder)
  const hash = (s:string) => createHash("sha256").update(s).digest("hex")
  const payload = ["ohmycode-v1",signed.headers.get("x-ohmycode-time"),signed.headers.get("x-ohmycode-nonce"),"POST","/v1/chat/completions",hash(await signed.clone().text()),hash(key)].join("\n")
  const pem = await readFile(path.join(folder,"signing.pem"),"utf8")
  expect(verify(null,Buffer.from(payload),createPublicKey(pem),Buffer.from(signed.headers.get("x-ohmycode-signature")!,"base64"))).toBe(true)
  expect((await signDeviceRequest(request,folder)).headers.get("x-ohmycode-nonce")).not.toBe(signed.headers.get("x-ohmycode-nonce"))
  expect((await signDeviceRequest(new Request("https://example.com/v1/chat/completions",{headers:{authorization:"Bearer "+key}}),folder)).headers.has("x-ohmycode-signature")).toBe(false)
 } finally { await rm(folder,{recursive:true,force:true}) }
})
