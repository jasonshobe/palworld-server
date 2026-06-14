import { apiFetch } from "./client"
import type { PlayersResponse, PalSummary, PalDetailData, PassiveOption, ActiveSkillOption } from "@/types"

export const getPlayers = () => apiFetch<PlayersResponse>("/saves/players")
export const getPals = (playerUid: string) =>
  apiFetch<PalSummary[]>(`/saves/pals?player_uid=${encodeURIComponent(playerUid)}`)
export const patchPal = (instanceId: string, playerUid: string, key: string, value: unknown) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ player_uid: playerUid, key, value }),
  })
export const getPal = (instanceId: string, playerUid: string) =>
  apiFetch<PalDetailData>(`/saves/pals/${instanceId}?player_uid=${encodeURIComponent(playerUid)}`)
export const deletePal = (instanceId: string) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, { method: "DELETE" })
export const duplicatePal = (instanceId: string, playerUid: string) =>
  apiFetch<PalSummary>(`/saves/pals/${instanceId}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ player_uid: playerUid }),
  })
export const commitSave = () => apiFetch<{ ok: boolean }>("/saves/commit", { method: "POST" })

export const getPassives = () => apiFetch<PassiveOption[]>("/saves/data/passives")
export const getActiveSkills = () => apiFetch<ActiveSkillOption[]>("/saves/data/active-skills")
export const getSuitabilities = () => apiFetch<string[]>("/saves/data/suitabilities")
