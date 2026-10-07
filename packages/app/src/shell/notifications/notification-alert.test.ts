import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test"
import type { ToastOptions } from "@opencode/ui/toast"
import { createNotificationCoordinator } from "./coordinator"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { ServerSDK } from "@/runtime/server/client"
import type { SessionInfo } from "@opencode/client/promise"
import type { Data } from "@opencode/client/solid"
import type { ServerConnection } from "@/runtime/server/registry"
import { ServerScope } from "@/runtime/server/scope"
import type { Tab } from "@/shell/tabs/tabs"

// SAFETY: This fixture is the local server key produced by the server registry.
const server = "local\nhttp://localhost:4096" as ServerConnection.Key

type NotificationEvent = {
  type: "session.execution.failed" | "session.execution.succeeded"
  id: string
  data: { sessionID: string; error: { type: string; message: string; status: number } }
}

const session: SessionInfo = {
  id: "session-1",
  title: "Test session",
  location: { directory: "/project" },
  projectID: "project-1",
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
}

const alerts: string[] = []

const descriptions: string[] = []

const toasts: ToastOptions[] = []

const opened: string[] = []

const tabStore: Tab[] = []

const tabs = { store: tabStore }

let createServerNotificationState: typeof import("./notification").createServerNotificationState

let storage: typeof import("@/runtime/persistence/storage")

beforeAll(async () => {
  storage = await import("@/runtime/persistence/storage")
  const { sessionIDHasOpenTab } = await import("@/shell/tabs/tabs")
  mock.module("@/runtime/platform/platform", () => ({
    usePlatform: () => ({
      platform: "web",
      notify: async (title: string, description: string) => {
        alerts.push(title)
        descriptions.push(description)
      },
      openExternal: (url: string) => opened.push(url),
    }),
  }))
  mock.module("./toast", () => ({ showToast: (options: ToastOptions) => toasts.push(options) }))
  mock.module("@/settings/model", () => ({
    useSettings: () => ({
      sounds: { agentEnabled: () => false, errorsEnabled: () => false },
      notifications: { agent: () => true, errors: () => true },
    }),
  }))
  mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
  mock.module("@/shell/tabs/tabs", () => ({
    useTabs: () => tabs,
    sessionIDHasOpenTab,
  }))
  mock.module("@/runtime/persistence/storage", () => ({
    ...storage,
    persisted: () => {
      const [store, setStore] = createStore({ list: [] })

      return [store, setStore, undefined, () => false]
    },
  }))
  createServerNotificationState = (await import("./notification")).createServerNotificationState
})

afterAll(() => mock.module("@/runtime/persistence/storage", () => storage))

test.each([
  ["session.execution.succeeded", "notification.session.responseReady.title"],
  ["session.execution.failed", "notification.session.error.title"],
] as const)("system alert for %s requires an open session tab", async (type, title) => {
  alerts.length = 0
  tabs.store = [{ type: "session", server, sessionId: "another-session" }]

  let listener: ((event: NotificationEvent) => void) | undefined

  const dispose = createRoot((dispose) => {
    const state = createServerNotificationState({
      key: server,
      // SAFETY: The notification handler only reads scope and registers its event listener.
      sdk: {
        scope: ServerScope.local,
        event: {
          listen: (fn: typeof listener) => {
            listener = fn

            return () => {}
          },
        },
      } as ServerSDK,
      // SAFETY: The loaded session fixture means the handler only calls session.get.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- SAFETY: Only session.get is exercised for these already-loaded session fixtures.
      data: { session: { get: () => session } } as unknown as Data,
      coordinator: { ...createNotificationCoordinator(), system: async (_id: string, fn: () => Promise<void>) => fn() },
    })

    return { dispose, state }
  })

  listener?.({
    type,
    id: "event-1",
    data: { sessionID: session.id, error: { type: "api", message: "failed", status: 500 } },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(dispose.state.session.all(session.id)).toHaveLength(1)
  expect(alerts).toEqual([])

  tabs.store = [{ type: "session", server, sessionId: session.id }]
  listener?.({
    type,
    id: "event-2",
    data: { sessionID: session.id, error: { type: "api", message: "failed", status: 500 } },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(alerts).toEqual([title])
  dispose.dispose()
})

test("terminal balance failure offers top-up once and explains background failures", async () => {
  alerts.length = 0
  descriptions.length = 0
  toasts.length = 0
  opened.length = 0
  tabs.store = [{ type: "session", server, sessionId: session.id }]
  const focus = spyOn(document, "hasFocus").mockReturnValue(true)

  let listener: ((event: NotificationEvent) => void) | undefined

  const root = createRoot((dispose) => {
    const state = createServerNotificationState({
      key: server,
      // SAFETY: The notification handler only reads scope and registers its event listener.
      sdk: {
        scope: ServerScope.local,
        event: {
          listen: (fn: typeof listener) => {
            listener = fn

            return () => {}
          },
        },
      } as ServerSDK,
      // SAFETY: The loaded session fixture means the handler only calls session.get.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- SAFETY: Only session.get is exercised for these already-loaded session fixtures.
      data: { session: { get: () => session } } as unknown as Data,
      coordinator: createNotificationCoordinator(),
    })

    return { dispose, state }
  })

  const event: NotificationEvent = {
    type: "session.execution.failed",
    id: "balance-error",
    data: { sessionID: session.id, error: { type: "provider.quota", message: "Insufficient balance", status: 402 } },
  }

  listener?.(event)
  listener?.(event)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.session.all(session.id)).toHaveLength(1)
  expect(toasts).toHaveLength(1)
  expect(toasts[0].title).toBe("lama.error.balance.title")
  expect(toasts[0].description).toBe("lama.error.balance.description")
  expect(toasts[0].actions?.[0].label).toBe("lama.account.topup")
  const action = toasts[0].actions?.[0].onClick

  if (!action || action === "dismiss") throw new Error("Missing top-up action")

  action()
  expect(opened).toEqual(["https://ohmylama.ru/subscription#topup"])
  expect(alerts).toEqual([])

  focus.mockReturnValue(false)
  listener?.({ ...event, id: "background-error" })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(toasts).toHaveLength(1)
  expect(alerts).toEqual(["lama.error.balance.title"])
  expect(descriptions).toEqual(["lama.error.balance.description"])
  root.dispose()
  focus.mockRestore()
})
