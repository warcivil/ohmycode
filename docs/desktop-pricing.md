# OhMyCode desktop pricing trial

Release candidate: 2.0.24-ohmycode.27, production application channel. Build with OHMYCODE_BUILD_CHANNEL=prod and OHMYCODE_BUILD_VERSION=2.0.24-ohmycode.27 using bun run package:ohmycode:win on Windows or bun run package:ohmycode:deb on Linux. The sol-release workflow uploads build artifacts only; no release or production update feed is published from this branch.

Sign in again through the OhMyLama login window. The installation creates an Ed25519 key pair, sends the public key during device authorization and signs API requests. Manually entered API keys and older sign-ins retain normal prices. The server returns eligible prices in /v1/account; the model picker uses these prices. Sol input/output are $0.60/$2.40 per million; cache and long-context rules remain unchanged. This is a test tariff with no automatic expiration.

Security boundary: this prevents discount activation by just copying an API key, changing User-Agent or replaying a signed request. It is proof of possession, not application attestation: someone controlling a modified client or the full local profile can reproduce the protocol. Private keys remain local and must never be embedded in installers or committed. Requests to other origins are not signed. Server verification binds the API key hash, method, URL path/query, body, timestamp and a single-use nonce.

Backend deployment requires migration dp20261029 before restarting workers. Existing API keys remain valid with a null public key. Roll back application code without dropping this nullable column if necessary.
