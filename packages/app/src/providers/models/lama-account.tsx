import { useQuery } from "@tanstack/solid-query"
import { Show } from "solid-js"
import { Schema } from "effect"
import { LamaAccount, LamaAccountRpc } from "@opencode/schema/lama-account"
import { Button } from "@opencode/ui/button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { usePlatform } from "@/runtime/platform/platform"

export function LamaAccountControl(props: { provider?: string }) {
  const sdk = useServerSDK()
  const language = useLanguage()
  const platform = usePlatform()

  const account = useQuery(() => ({
    queryKey: ["lama", "account", sdk.url],
    queryFn: async ({ signal }) => {
      const result = await sdk.api.rpc.call({ rpcID: LamaAccountRpc.id, method: "get", input: {} }, { signal })

      return Schema.decodeUnknownSync(LamaAccount)(result.output)
    },
    enabled: props.provider === "ohmylama",
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  }))

  const label = () => {
    if (account.isPending) return language.t("lama.account.loading")
    const data = account.data

    if (account.isError || !data) return language.t("lama.account.unavailable")

    if (data.status !== "ready") return language.t(`lama.account.${data.status}`)

    return language.t("lama.account.balance", {
      amount: new Intl.NumberFormat(language.intl(), {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 2,
      }).format(data.balance),
    })
  }

  const empty = () => account.data?.status === "ready" && account.data.balance <= 0

  return (
    <Show when={props.provider === "ohmylama"}>
      <div class="flex flex-wrap items-center justify-end gap-2 px-2 text-[12px] leading-4 text-v2-text-text-muted">
        <Tooltip value={language.t("lama.account.note")}>
          <button
            type="button"
            onClick={() => account.refetch()}
            title={language.t("lama.account.refresh")}
            class="rounded-sm hover:text-v2-text-text-base"
            style={{ color: empty() ? "var(--icon-warning-base)" : undefined }}
          >
            {label()}
          </button>
        </Tooltip>
        <Button
          variant="ghost-muted"
          size="small"
          onClick={() => platform.openExternal("https://ohmylama.ru/subscription#topup")}
        >
          {language.t("lama.account.topup")}
        </Button>
      </div>
    </Show>
  )
}
