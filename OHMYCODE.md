# OhMyCode

LAMA desktop client based on the upstream OpenCode `v2` branch (2.0.24,
`80c4a6b7c873050f66457a95a71f90a4df5d4fa0`). All workspace packages, including
server, client and renderer, are built from the same checkout. No legacy V1
protocol adapters or downloaded server binaries are added by this fork.

## Build and launch

Use Bun 1.4.2 and Node 24:

```sh
bun install --frozen-lockfile
bun run build:ohmycode
./start-ohmycode.sh
```

The build downloads the matching Electron runtime and compiles the local CLI
for the desktop platform before building the desktop. Keep the MIT license
and upstream notices when distributing. Windows and macOS need their own
builds; this preview is validated on Linux only.

## LAMA

Connect LAMA in the model picker using website login or an API key. Website
login opens `https://ohmylama.ru/desktop/connect`, displays a confirmation code,
and stores the issued key through the native OpenCode credential store.
Keys are never bundled. `LAMA_API_KEY` is also supported for local testing.

Only the LAMA provider is exposed. The bundled public catalog snapshot lives
in `packages/core/src/plugin/provider/lama-catalog.ts` and includes retail
input/output/cache costs. All listed models expose tool and image input
capabilities; actual image support depends on the upstream model. Context
limits currently use a conservative 131072 input-context / 16384 output
budget and are not advertised as exact model specifications.

Context views show USD with up to six decimals and an approximate RUB amount
using LAMA's public conversion rate. If the rate cannot be fetched, USD stays
available. Billing by the LAMA service remains authoritative.

## Isolation and updates

Ubuntu installation and `.deb` build instructions: [INSTALL-UBUNTU.md](INSTALL-UBUNTU.md).

Desktop identities are `ru.ohmylama.ohmycode.dev`, `.beta` and
`ru.ohmylama.ohmycode`. Data, config, cache and service state live inside the
respective desktop profile. Default managed-service ports are 49474 (dev),
49475 (beta), and 49476 (production); an existing service configuration wins.
The installed ordinary OpenCode profile is not migrated or modified.

Russian is the initial UI language. An explicit saved language choice wins.
Upstream automatic updates are disabled until an OhMyCode release feed exists.
This is a local preview, not a signed cross-platform release.

API balance is fetched through the native `ohmycode.account` RPC using the selected LAMA credential. `/v1/account` authenticates without increasing the key request counter. The composer refreshes the balance every 30 seconds and on window focus; top-ups open `https://ohmylama.ru/subscription#topup`. The key is never returned to the renderer by this RPC.

LAMA automatic compaction starts at 200,000 tokens of the current context (including cached tokens and tool content), or earlier when the model's input/context window requires a reply reserve. The threshold does not replace the manufacturer window shown in model details, and manual compaction and overflow recovery keep their existing behavior. Other providers' compaction policy is unchanged.

Manufacturer limits were checked on 2026-10-06. Sources for the catalog snapshot:

- GPT: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) and [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5): 1,050,000 context / 128,000 output. `gpt-5.6` is the documented Sol alias; `gpt-6-astra-cheaper` is our Astra route alias.
- Claude: [current models](https://platform.claude.com/docs/en/models/overview) and individual legacy model pages under `/docs/en/models/{model}/overview`: Fable 5/5.1, Opus 4.6/4.7/4.8/5/5.5 and Sonnet 4.6/5/5.5 are 1,000,000 / 128,000. [Sonnet 4.5](https://platform.claude.com/docs/fr/models/sonnet-4-5/overview) and Haiku 4.5 are 200,000 / 64,000. Batch-only extended output is not used.
- Gemini: [individual model specs](https://ai.google.dev/gemini-api/docs/models): 1,048,576 input / 65,536 output for the listed Flash, Pro and Flash-Lite versions. Our Flash-Lite preview alias uses the same limits as the documented preview version.
- Grok: [4.6](https://docs.x.ai/developers/models/grok-4.6) and [4.7](https://docs.x.ai/developers/grok-4-7): 500,000 context. There is no separate text-output limit; the catalog output ceiling equals the context window and Core fits actual output to remaining room.
- GLM: [5.3](https://docs.z.ai/guides/llm/glm-5.3), [5.3 Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash), [5.2](https://docs.z.ai/guides/llm/glm-5.2), the manufacturer's model configuration and [API parameter range](https://docs.z.ai/api-reference/llm/chat-completion): 1,048,576 / 131,072.
- Qwen: [manufacturer model table](https://docs.qwencloud.com/developer-guides/getting-started/vision-models): 1M context, 128k output for 3.8 Max and 64k for 3.7 Plus. The table's abbreviated limits are stored as 1,000,000 / 128,000 or 64,000.
- Kimi K3: [API troubleshooting](https://www.kimi.ai/help/kimi-api/api-troubleshooting): combined window is 1024×1024; output can use the remaining context. Catalog output ceiling equals the window, while Core fits actual output to remaining room.
- DeepSeek V4/V4.1: [model details](https://api-docs.deepseek.com/quick_start/pricing/), manufacturer model configuration and [max_tokens parameter](https://api-docs.deepseek.com/api/create-chat-completion/): 1,048,576 / 393,216. V3.2 retains the published legacy API limits of 128k / 64k.
- MiniMax: [M3](https://www.minimax.io/models/text/m3) advertises up to 1M context (512k guaranteed); [API output limits](https://platform.minimax.io/docs/api-reference/text-chat-openai) are 524,288 for M3 and 204,800 for M2.x. Manufacturer configurations give [M2.7](https://huggingface.co/MiniMaxAI/MiniMax-M2.7/blob/main/config.json) 204,800 context and [M2.5](https://huggingface.co/MiniMaxAI/MiniMax-M2.5/blob/main/config.json) 196,608. Output is additionally constrained by remaining context in Core.

These are manufacturer ceilings as authorized for our provider routes, not claims that a million-token request was sent through each route. The regular Core per-request output cap (256,000 tokens) still applies.

## Generation error notifications

Terminal provider failures show actionable notifications for insufficient API
balance, invalid credentials, denied access, request limits, context overflow,
model availability and connection interruptions. The focused app shows one toast;
background system alerts follow the existing notification setting. Intermediate
retries do not notify. Top-up opens the LAMA balance page; other notices open the
failed chat. Technical errors stay in the transcript, and unknown/tool/policy
errors keep the existing presentation. A repeated terminal event is shown once.

Russian copy was reviewed separately against the maintained
[VS Code Russian corpus](https://github.com/microsoft/vscode-loc/blob/main/i18n/vscode-language-pack-ru/translations/main.i18n.json)
and [Firefox Russian network errors](https://github.com/mozilla-l10n/firefox-l10n/blob/main/ru/toolkit/toolkit/neterror/netError.ftl).
“API-баланс” and “сжать историю” retain the existing LAMA product vocabulary;
no plural-sensitive phrases were added. No regional variants are required.

## Windows installer

The separate `OhMyCode Windows installer` workflow builds on `windows-2025`.
Pushes to `windows-installer` run it automatically; it also supports manual
dispatch. It builds the Windows CLI from this checkout, packages NSIS, verifies
a silent installation and an authenticated `/api/info` response from the installed
server, and uploads `ohmycode-windows-x64` with the `.exe`, installation notes and
SHA-256 checksum. It does not publish a release or require provider keys/signing
credentials. Local Windows x64 builds use `bun run package:ohmycode:win`.
