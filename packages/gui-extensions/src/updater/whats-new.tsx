import { For, Show } from "solid-js"
import { Effect, Option, Predicate, Schema } from "effect"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useExtension, type DialogHandle, type SetupContext } from "../sdk"
import type definition from "./index"

const CHANGELOG_URL = "https://ohmylama.ru/api/uploads/ohmycode-updates/changelog.json"

type Highlight = {
  title: string
  description: string
  media?: { type: "image" | "video"; src: string; alt?: string }
}

/** An optional field that reads as absent when it holds anything else, as the changelog is read leniently. */
function lenient<S extends Schema.ConstraintCodec<unknown, unknown>>(schema: S) {
  const field = Schema.optional(schema)

  return Schema.catchDecoding<typeof field>(() => Effect.succeed(Option.none()))(field)
}

/** A list entry that reads as undefined when it is malformed, so the rest of the list still counts. */
function entry<S extends Schema.ConstraintCodec<unknown, unknown>>(schema: S) {
  const item = Schema.UndefinedOr(schema)

  return Schema.catchDecoding<typeof item>(() => Effect.succeed(Option.some(undefined)))(item)
}

const Text = lenient(Schema.Union([Schema.String, Schema.Number]))

const Media = Schema.Struct({ type: Text, src: Text, url: Text })

const Item = Schema.Struct({ title: Text, description: Text, shortDescription: Text, media: lenient(Media) })

const Group = Schema.Struct({ ...Item.fields, source: Text, items: lenient(Schema.Array(entry(Item))) })

const Release = Schema.Struct({
  tag: Text,
  tag_name: Text,
  name: Text,
  highlights: lenient(Schema.Array(entry(Group))),
})

const Releases = Schema.Array(entry(Release))

const Changelog = Schema.Union([Releases, Schema.Struct({ releases: Releases })])

const decodeChangelog = Schema.decodeUnknownOption(Changelog)

/**
 * Shows the desktop highlights of the releases since `previous` once the changelog loads, and remembers the current
 * version as seen. A changelog without highlights only remembers the version; a failed request leaves it for the next
 * start.
 */
export function showWhatsNew(
  ctx: SetupContext<typeof definition>,
  input: { readonly previous: string; readonly current: string; readonly markSeen: () => void },
) {
  const timers = new Set<ReturnType<typeof setTimeout>>()

  ctx.signal.addEventListener("abort", () => timers.forEach(clearTimeout))

  fetch(CHANGELOG_URL, { signal: ctx.signal, headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((json) => {
      if (!json) return

      const highlights = Option.match(decodeChangelog(json), {
        onNone: () => [],
        onSome: (changelog) => sliceHighlights(releases(changelog), input.current, input.previous),
      })

      if (ctx.signal.aborted) return

      if (highlights.length === 0) return input.markSeen()

      timers.add(
        setTimeout(() => {
          input.markSeen()
          ctx.dialogs.open((dialog) => <DialogReleaseNotes highlights={highlights} version={input.current} dialog={dialog} />, {
            replace: true,
          })
        }, 500),
      )
    })
    .catch(() => undefined)
}

function releases(changelog: typeof Changelog.Type) {
  return ("releases" in changelog ? changelog.releases : changelog).flatMap((release) => {
    if (!release) return []

    const groups = release.highlights ?? []

    return [
      {
        tag: text(release.tag) ?? text(release.tag_name) ?? text(release.name),
        highlights: groups.flatMap((group) => {
          const source = text(group?.source)

          if (!group || !source?.toLowerCase().includes("desktop")) return []

          if (group.items) return group.items.flatMap((item) => (item ? Option.toArray(highlight(item)) : []))

          return Option.toArray(highlight(group))
        }),
      },
    ]
  })
}

function highlight(item: typeof Item.Type): Option.Option<Highlight> {
  const title = text(item.title)
  const description = text(item.description) ?? text(item.shortDescription)

  if (!title || !description) return Option.none()

  return Option.some({ title, description, media: media(item.media, title) })
}

function media(value: typeof Media.Type | undefined, alt: string): Highlight["media"] {
  const type = text(value?.type)?.toLowerCase()
  const src = text(value?.src) ?? text(value?.url)

  if (!src) return

  if (type !== "image" && type !== "video") return

  return { type, src, alt }
}

/** A trimmed, non-empty string, or a number written out. */
function text(value: string | number | undefined) {
  if (Predicate.isNumber(value)) return String(value)

  return value?.trim() || undefined
}

function normalizeVersion(value: string | undefined) {
  const text = value?.trim()

  if (!text) return

  return text.startsWith("v") || text.startsWith("V") ? text.slice(1) : text
}

function sliceHighlights(list: { tag?: string; highlights: Highlight[] }[], current: string, previous: string) {
  const now = normalizeVersion(current)
  const before = normalizeVersion(previous)

  const start = (() => {
    if (!now) return 0

    const index = list.findIndex((release) => normalizeVersion(release.tag) === now)

    return index === -1 ? 0 : index
  })()

  const end = (() => {
    if (!before) return list.length

    const index = list.findIndex((release, i) => i >= start && normalizeVersion(release.tag) === before)

    return index === -1 ? list.length : index
  })()

  const seen = new Set<string>()

  return list
    .slice(start, end)
    .flatMap((release) => release.highlights)
    .filter((item) => {
      const key = [item.title, item.description, item.media?.type ?? "", item.media?.src ?? ""].join("\n")

      if (seen.has(key)) return false

      seen.add(key)

      return true
    })
    .slice(0, 5)
}

function DialogReleaseNotes(props: { highlights: Highlight[]; version: string; dialog: DialogHandle }) {
  const ctx = useExtension<typeof definition>()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={ctx.t("releaseNotes.heading")} description={props.version} />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-5 px-4 pb-4 max-h-[60vh] overflow-y-auto">
          <For each={props.highlights}>
            {(feature) => (
              <section class="flex flex-col gap-2">
                <h2 class="text-14-medium text-text-strong">{feature.title}</h2>
                <p class="text-14-regular text-text-base whitespace-pre-wrap break-words">{feature.description}</p>
                <Show when={feature.media}>
                  {(media) => (
                    <Show
                      when={media().type === "image"}
                      fallback={<video src={media().src} controls muted playsinline class="w-full rounded-lg" />}
                    >
                      <img
                        src={media().src}
                        alt={media().alt ?? feature.title}
                        class="w-full rounded-lg object-contain"
                      />
                    </Show>
                  )}
                </Show>
              </section>
            )}
          </For>
        </div>
      </DialogBody>
      <DialogFooter>
        <div class="flex w-full flex-wrap items-center justify-between gap-4">
          <Switch
            checked={ctx.stores.releaseNotes.value.enabled}
            onChange={(enabled) => ctx.stores.releaseNotes.update((draft) => { draft.enabled = enabled })}
          >
            {ctx.t("releaseNotes.showAfterUpdate")}
          </Switch>
          <Button variant="contrast" size="large" autofocus onClick={() => props.dialog.close()}>
            {ctx.t("releaseNotes.dismiss")}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  )
}
