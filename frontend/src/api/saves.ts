import { apiFetch } from "./client"
import type { PlayersResponse, PalSummary } from "@/types"

export const getPlayers = () => apiFetch<PlayersResponse>("/saves/players")
export const getPals = (playerUid: string) =>
  apiFetch<PalSummary[]>(`/saves/pals?player_uid=${encodeURIComponent(playerUid)}`)
export const patchPal = (instanceId: string, playerUid: string, key: string, value: unknown) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ player_uid: playerUid, key, value }),
  })
export const getPal = (instanceId: string, playerUid: string) =>
  apiFetch<Record<string, unknown>>(`/saves/pals/${instanceId}?player_uid=${encodeURIComponent(playerUid)}`)
export const deletePal = (instanceId: string) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, { method: "DELETE" })
export const commitSave = () => apiFetch<{ ok: boolean }>("/saves/commit", { method: "POST" })
