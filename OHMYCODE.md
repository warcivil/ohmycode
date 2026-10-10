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
input/output/cache costs. Image input and reasoning-effort choices are declared
per model, rather than inherited from OpenCode's permissive defaults. Empty effort
choices mean no verified control through the current LAMA gateway, not that the
model cannot reason. Manufacturer context/output ceilings remain separate from
the 200k automatic-compaction threshold.

Model IDs and capabilities refresh from `/api/models/desktop` in the background
on backend startup and hourly while running. Startup uses the last validated disk
cache, or the bundled snapshot if unavailable. Requests time out after five seconds;
HTTP failures, invalid schemas and empty catalogs preserve the working inventory.
ETags avoid downloading unchanged catalogs. Provider reload publishes native catalog
events without restarting the server or cancelling an in-flight generation.
Removed models retain deprecated definitions for existing conversations. The app
does not switch the selected model or reasoning mode on catalog refresh.

The website owns `backend/app/desktop_models.json`: add a reviewed model there and
to the public API inventory, with its retail price. The endpoint intersects these
lists, so unknown `/v1/models` entries are not assigned guessed capabilities.
Schema v1 carries input/output modalities, tool support, reasoning support and
verified effort values, context/output limits, and retail USD/million-token costs.
`files.text=tools` means local code/text reading through app tools; `files.native`
lists native file modalities separately. No PDF/audio/video support is currently
advertised without an end-to-end gateway test. Supplier URLs, keys and purchase
prices are never part of the public contract.

Deployment: publish the backend endpoint, then ship one app build containing this
discovery client. Existing installed builds through `.14` still use static IDs.
After that, compatible catalog changes require only a backend catalog update.
New wire protocols or unsupported control types still require an app update.

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

- GPT: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) and [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5): 1,050,000 context / 128,000 output. The LAMA catalog uses explicit GPT-5.6 Luna/Terra/Sol IDs because its legacy unsuffixed alias selects a different model by effort; `gpt-6-astra-cheaper` is our Astra route alias.
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


Own updates (2.0.24-ohmycode.5): dev installers check the separate ohmylama.ru feed on launch and every ten minutes, download in the background, and install only on explicit request. No downgrade or upstream OpenCode update is allowed. Packaging tests validate channel isolation; updater state-machine tests cover concurrent checks, cache revalidation and failed-install retry. Windows uses NSIS; Linux uses the generated package-type marker and .deb updater. macOS remains disabled pending a signed distribution. See PUBLISH-UPDATES.txt for publication. Changed en/ru copy only substitutes the product name in existing reviewed translations.


## Capability audit — 2026-10-09

The snapshot now lists Haiku 5.5 and the three explicit GPT-5.6 models. Haiku 5.5
uses the published 1M / 128K limits and LAMA retail prices. Models outside the
coding/chat catalog (audio, embeddings, image generation) are not added blindly
from `/v1/models`.

- GPT-6.1 Sol and Astra: low/medium/high/xhigh/max. GPT-6 Sol, Luna and GPT-5.6
  also allow none; GPT-5.5 has none through xhigh. Sources: individual model pages
  at [OpenAI](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
- Grok 4.6/4.7: low/medium/high/xhigh, no off. Source:
  [Grok reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning).
- Current Claude models: model-specific effort ranges. Sonnet/Opus 4.6 omit
  xhigh. Haiku/Sonnet 4.5 need a verified thinking-budget translation before a
  control is exposed through LAMA; a native budget is not interchangeable with
  an effort field. Source: [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)
  and [models](https://platform.claude.com/docs/en/models/overview).
- GLM-5.3 is text-only; GLM-5.3 Flash accepts images. Both expose low/high/max.
  GLM-5.2 is text-only. Sources: [5.3](https://docs.z.ai/guides/llm/glm-5.3),
  [Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash),
  [5.2](https://docs.z.ai/guides/llm/glm-5.2).
- Kimi K3: low/high/max; reasoning cannot be disabled.
  [Kimi API](https://www.kimi.ai/help/kimi-api/api-troubleshooting).
- DeepSeek V4.1 Flash sees images; V4 Pro did not see the supplied image through
  LAMA. V4/4.1 expose low/high/max; V4.1 additionally exposes the live-tested none.
  V3.2 has no verified effort control. Sources:
  [model metadata](https://api-docs.deepseek.com/api/list-models/) and
  [thinking](https://api-docs.deepseek.com/guides/thinking_mode/).
- MiniMax M2.x is text-only and always thinks. M3 accepts images but the current
  gateway does not forward its thinking toggle. Neither gets a fake effort menu:
  [MiniMax API](https://platform.minimax.io/docs/api-reference/text-chat-openai).
- Qwen 3.8 Max and 3.7 Plus accept images. Thinking activation requires
  `enable_thinking`, which LAMA's request schema currently drops; no toggle is
  advertised until that path is implemented. Sources: [vision](https://docs.qwencloud.com/developer-guides/getting-started/vision-models)
  and [thinking](https://docs.qwencloud.com/developer-guides/text-generation/thinking).
- Gemini keeps low/medium/high. Source:
  [thinking levels](https://ai.google.dev/gemini-api/docs/thinking).

Live checks used a synthetic four-digit image and a harmless `report_code` tool
through LAMA, not direct manufacturer credentials. They made 25 bounded requests
with at most 1024 output tokens each; no tool was actually executed. Results are
in [the audit data](docs/model-capability-audit-2026-10-09.json).
A successful tool call with the correct image-only code verifies that particular
vision/tool path. A 200 for an effort parameter verifies acceptance, not a measured
change in intelligence or reasoning depth. MiniMax M2.5/M2.7 returned 502 in this
run; this is an availability result, not proof that tools are unsupported.
DeepSeek V3.2 did not call the requested tool in this single probe; tool support
remains documented but this gateway path needs follow-up. Full context limits,
all effort levels, every model and multi-turn tool loops were not load-tested.

Official GPT-6 documentation requires Responses for reasoning plus tool calling.
The LAMA Chat Completions gateway returned valid tool calls in the sampled GPT
checks; this observed gateway compatibility must not be assumed for a direct
OpenAI endpoint.
