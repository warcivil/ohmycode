export * as TelegramTool from "./telegram.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Effect, Schema } from "effect"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { FileAccess } from "../../file-access.js"
import { Permission } from "../../permission.js"
import { Location } from "../../location.js"

const Bridge = Schema.Struct({ url: Schema.String, secret: Schema.String })

export const Plugin = {
  id: "ohmycode.tool.telegram",
  effect: Effect.fn("TelegramTool.Plugin")(function* (ctx: Context) {
    const access = yield* FileAccess.Service
    const permission = yield* Permission.Service
    const location = yield* Location.Service

    yield* ctx.tool.transform((editor) => editor.add({
      name: "telegram_send_file",
      options: { codemode: false },
      description: "Send a local file as an actual Telegram document to the owner of this remotely controlled conversation. Use when the user asks to send a created file or screenshot here/to Telegram. Maximum 50 MB per file. Call once per file; do not claim delivery unless this tool succeeds. Requires an active Telegram task. Remote workspace files must first be downloaded to this computer.",
      input: Schema.Struct({ path: Schema.String.annotate({ description: "Path of the existing local file to send" }) }),
      output: Schema.Struct({ sent: Schema.Boolean }),
      execute: (input, context) => Effect.gen(function* () {
        if (location.workspaceID) return yield* Effect.fail(new Error("Only local files can be sent to Telegram"))
        const target = yield* access.authorizeRead(input.path, context)
        yield* permission.assert({
          action: "telegram_send_file", resources: [target.absolute], save: [], metadata: { path: input.path },
          sessionID: context.sessionID, agent: context.agent,
          source: { type: "tool", messageID: context.messageID, id: context.id },
        })
        yield* Effect.tryPromise(async (signal) => {
          const root = process.env.XDG_DATA_HOME

          if (!root) throw new Error("Desktop Telegram connection unavailable")
          const bridge = Schema.decodeUnknownSync(Bridge)(JSON.parse(await readFile(join(root, "opencode", "telegram-bridge.json"), "utf8")))
          const url = new URL(bridge.url)

          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("Invalid desktop bridge")
          const response = await fetch(url, {
            method: "POST", headers: { authorization: `Bearer ${bridge.secret}`, "content-type": "application/json" },
            body: JSON.stringify({ session: context.sessionID, id: context.id, path: target.absolute }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(360000)]), redirect: "error",
          })

          if (!response.ok) throw new Error("File delivery failed; check desktop connection and file size")
        })

        return { output: { sent: true }, content: "File delivered to the user's Telegram chat.", metadata: { sent: true } }
      }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Could not send file to Telegram", error }))),
    })).pipe(Effect.orDie)
  }),
}
