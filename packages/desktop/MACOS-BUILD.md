# OhMyCode macOS test builds

Existing Electron GUI, no new interface or OhMyAgent changes.

The `OhMyCode macOS test builds` workflow runs on pushes to `macos-builds` or
manual dispatch. Each native runner builds the web UI, native Bun core and Electron
application, then packages DMG and ZIP. Intel uses the baseline x64 CLI.

Artifacts: `ohmycode-macos-x64-test` and `ohmycode-macos-arm64-test`, retained 30 days.
No release or website update is published. The test-only builder config uses an
ad-hoc signature and skips Apple notarization; production signing defaults are
unchanged. Developer ID/notarization must be arranged before ordinary public
Mac distribution. Installation guidance and SHA256 hashes accompany each build.

CI checks the architecture of both executables, app signature structure, packaged
core version and authenticated core startup under an isolated temporary profile.
The interactive GUI, login, model response, terminal and reopening history still
need testing on a Mac. No real login, pairing or paid model request runs in CI.

A `macos-result-<run-id>` branch contains `.ci/macos-result.json` with the
source SHA, workflow outcome and artifact metadata, allowing SSH-only maintainers
to inspect the result without copying a GitHub API token to their machine.
