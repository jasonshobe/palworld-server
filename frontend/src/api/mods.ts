import { apiFetch } from "./client"
import type { ModInfo, ModsResponse } from "@/types"

export const getMods = () => apiFetch<ModsResponse>("/mods")

export const deleteMod = (path: string) =>
  apiFetch<{ ok: boolean }>(
    `/mods/${path.split("/").map(encodeURIComponent).join("/")}`,
    { method: "DELETE" }
  )

export async function uploadMod(file: File, subfolder: string): Promise<ModInfo> {
  const form = new FormData()
  form.append("file", file)
  if (subfolder) form.append("subfolder", subfolder)
  const resp = await fetch("/api/mods/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  })
  if (resp.status === 401) {
    window.dispatchEvent(new Event("unauthorized"))
    const error = new Error("Unauthorized") as Error & { status?: number }
    error.status = 401
    throw error
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail ?? resp.statusText)
  }
  return resp.json() as Promise<ModInfo>
}
