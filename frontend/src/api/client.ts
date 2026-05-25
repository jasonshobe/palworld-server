const BASE = "/api"

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  })

  if (resp.status === 401) {
    window.dispatchEvent(new Event("unauthorized"))
    const error = new Error("Unauthorized")
    ;(error as any).status = 401
    throw error
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    const error = new Error(body.detail ?? resp.statusText)
    ;(error as any).status = resp.status
    throw error
  }

  return resp.json() as Promise<T>
}
