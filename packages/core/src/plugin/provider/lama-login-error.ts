/** Translate known device-login failures; do not mislabel other HTTP 400 errors. */
export async function lamaLoginError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => undefined)
  const detail = body && typeof body === "object" && "detail" in body ? body.detail : undefined
  if (detail === "Maximum 10 active API keys allowed")
    return new Error("У вас уже 10 активных API-ключей. На ohmylama.ru откройте API → Ключи, отзовите один ненужный ключ и повторите вход. Выход из приложения не отзывает ключ на сервере.")
  if (typeof detail === "string" && detail.trim()) return new Error(detail.slice(0, 500))
  return new Error(`Не удалось войти в OhMyLama (HTTP ${response.status}). Повторите вход; если ошибка сохраняется, обратитесь в поддержку.`)
}
