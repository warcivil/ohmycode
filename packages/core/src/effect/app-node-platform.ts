import { LLMClient, RequestExecutor } from "@opencode/ai/route"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { signLamaHttp } from "../plugin/provider/lama-http.js"
import { Socket } from "effect/unstable/socket"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { httpClient } from "@opencode/util/effect/app-node-platform"
import { WebSocketConstructor } from "./websocket-constructor.js"

export const requestExecutor = makeGlobalNode({
  service: RequestExecutor.Service,
  layer: RequestExecutor.layer.pipe(Layer.provide(Layer.effect(HttpClient.HttpClient, Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    return HttpClient.mapRequestEffect(http, signLamaHttp)
  })))),
  deps: [httpClient],
})

export const llmClient = makeGlobalNode({ service: LLMClient.Service, layer: LLMClient.layer, deps: [requestExecutor] })

export const webSocketConstructor = makeGlobalNode({
  service: Socket.WebSocketConstructor,
  layer: WebSocketConstructor.layer,
  deps: [],
})

export * as LayerNodePlatform from "./app-node-platform.js"
