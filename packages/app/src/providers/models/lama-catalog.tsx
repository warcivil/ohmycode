import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { Schema } from "effect"
import { createContext, createSignal, onCleanup, useContext, type Accessor, type ParentProps } from "solid-js"
import { LamaAccountRpc } from "@opencode/schema/lama-account"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"

const Amount = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

const Prices = Schema.Struct({
  unit: Schema.Literal("USD/1M tokens"),
  usd_rub_rate: Schema.Finite.check(Schema.isGreaterThan(0)),
  prices: Schema.Record(Schema.String, Schema.Array(Amount)),
})

const Health = Schema.Struct({
  is_up: Schema.NullOr(Schema.Boolean),
  ttft_ms: Schema.NullOr(Schema.Number),
  checked_at: Schema.NullOr(Schema.String),
  live_status: Schema.optional(Schema.String),
})

const Status = Schema.Struct({ models: Schema.Record(Schema.String, Health) })

export function lamaPrice(prices: typeof Prices.Type | undefined, model: string) {
  const key = Object.keys(prices?.prices ?? {})
    .sort((a, b) => b.length - a.length)
    .find((prefix) => model.startsWith(prefix))

  const value = key ? prices?.prices[key] : undefined

  return value && value.length >= 2 ? value : undefined
}

export function lamaStatus(health: typeof Health.Type | undefined) {
  if (!health?.checked_at || health.is_up === null) return "unknown"
  const checked = Date.parse(health.checked_at)

  // Health checks run every 30 minutes by day and 60 minutes at night.
  if (!Number.isFinite(checked) || Date.now() - checked > 75 * 60_000 || checked > Date.now() + 60_000) return "unknown"

  if (!health.is_up || health.live_status === "red") return "down"

  if (health.live_status === "orange" || (health.ttft_ms ?? 0) >= 30_000) return "slow"

  return "up"
}

async function get(path: string, force = false) {
  const response = await fetch(`https://ohmylama.ru/api/${path}`, {
    cache: force ? "no-store" : undefined,
    headers: force ? { "Cache-Control": "no-cache", Pragma: "no-cache" } : undefined,
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) throw new Error(`LAMA catalog: HTTP ${response.status}`)

  return response.json()
}

function createCatalog() {
  let forceNext = false
  const prices = useQuery(() => ({
    queryKey: ["lama", "prices"],
    queryFn: async () => Schema.decodeUnknownSync(Prices)(await get("models/prices", forceNext)),
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: 1,
  }))

  const status = useQuery(() => ({
    queryKey: ["lama", "status"],
    queryFn: async () => Schema.decodeUnknownSync(Status)(await get("status", forceNext)),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  }))

  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(timer))

  return {
    prices: () => (prices.isError ? undefined : prices.data),
    health: (model: string) => status.data?.models[model],
    state: (model: string) => {
      if (status.isError || now() - status.dataUpdatedAt > 120_000) return "unknown"

      return lamaStatus(status.data?.models[model])
    },
    refetch: async () => {
      forceNext = true
      try {
        await Promise.allSettled([prices.refetch(), status.refetch()])
      } finally {
        forceNext = false
      }
      setNow(Date.now())
    },
  }
}

const Context = createContext<ReturnType<typeof createCatalog>>()

export function LamaCatalogProvider(props: ParentProps) {
  return <Context.Provider value={createCatalog()}>{props.children}</Context.Provider>
}

export const useLamaCatalog = () => useContext(Context)

export function useLamaModelRefresh(directory: Accessor<string | undefined>) {
  const sdk = useServerSDK()
  const data = useData()
  const catalog = useLamaCatalog()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = createSignal(false)

  const refresh = async () => {
    if (refreshing()) return
    setRefreshing(true)
    try {
      const dir = directory()
      const ref = dir ? { directory: dir } : undefined
      await sdk.api.rpc
        .call({
          rpcID: LamaAccountRpc.id,
          method: "refresh",
          input: {},
          ...(ref ? { location: ref } : {}),
        })
        .catch(() => undefined)
      const resolved = ref ?? data.location.default()
      data.location.provider.invalidate(resolved)
      data.location.model.invalidate(resolved)
      await Promise.allSettled([
        data.location.provider.sync(resolved),
        data.location.model.sync(resolved),
        catalog?.refetch(),
        queryClient.invalidateQueries({ queryKey: ["lama", "account", sdk.url] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  return { refreshing, refresh }
}
