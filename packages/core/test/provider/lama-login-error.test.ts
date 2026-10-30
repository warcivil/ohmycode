import { expect, test } from "bun:test"
import { lamaLoginError } from "../../src/plugin/provider/lama-login-error"

test("device login explains the key limit without mislabeling other failures", async () => {
  for (const [response, expected] of [
    [Response.json({ detail: "Maximum 10 active API keys allowed" }, { status: 400 }), "API → Ключи"],
    [Response.json({ detail: "Invalid device public key" }, { status: 400 }), "Invalid device public key"],
    [Response.json({ detail: "Слишком много попыток входа" }, { status: 429 }), "Слишком много попыток входа"],
    [new Response("<html>Bad Gateway</html>", { status: 502 }), "HTTP 502"],
  ] as const) {
    const error = await lamaLoginError(response)
    expect(error.message).toContain(expected)
    if (response.status !== 400) expect(error.message).not.toContain("10 активных")
    expect(error.message).not.toContain("<html>")
  }
})
