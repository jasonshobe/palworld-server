import { apiFetch } from "./client"
import type { ServerStatus } from "@/types"

export const getServerStatus = () => apiFetch<ServerStatus>("/server/status")
export const startServer = () => apiFetch<{ ok: boolean }>("/server/start", { method: "POST" })
export const stopServer = () => apiFetch<{ ok: boolean }>("/server/stop", { method: "POST" })
export const updateServer = () => apiFetch<{ ok: boolean }>("/server/update", { method: "POST" })
