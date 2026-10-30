import { Effect } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import { signDeviceRequest } from "./lama-device.js"

export const signLamaHttp = (request: HttpClientRequest.HttpClientRequest) => Effect.gen(function* () {
  if (!request.url.startsWith("https://ohmylama.ru/v1/")) return request
  const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
  const signed = yield* Effect.promise(() => signDeviceRequest(web))
  return HttpClientRequest.setHeaders(request, Object.fromEntries(signed.headers))
})
