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

Desktop identities are `ru.ohmylama.ohmycode.dev`, `.beta` and
`ru.ohmylama.ohmycode`. Data, config, cache and service state live inside the
respective desktop profile. Default managed-service ports are 49474 (dev),
49475 (beta), and 49476 (production); an existing service configuration wins.
The installed ordinary OpenCode profile is not migrated or modified.

Russian is the initial UI language. An explicit saved language choice wins.
Upstream automatic updates are disabled until an OhMyCode release feed exists.
This is a local preview, not a signed cross-platform release.
