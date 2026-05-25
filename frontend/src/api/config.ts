import { apiFetch } from "./client"

export const getConfig = () => apiFetch<Record<string, unknown>>("/config")
export const putConfig = (settings: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>("/config", {
    method: "PUT",
    body: JSON.stringify({ settings }),
  })
