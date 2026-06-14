import { useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { patchPal } from "@/api/saves"

// Centralizes a Pal field PATCH: applies the change in-memory on the backend,
// invalidates the detail/list queries, and exposes the last error (e.g. 409 "list full").
export function usePalPatch(instanceId: string, playerUid: string) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const patch = useCallback(
    async (key: string, value: unknown) => {
      setError(null)
      try {
        await patchPal(instanceId, playerUid, key, value)
        qc.invalidateQueries({ queryKey: ["pal", instanceId] })
        qc.invalidateQueries({ queryKey: ["pals"] })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Edit failed")
      }
    },
    [instanceId, playerUid, qc],
  )

  return { patch, error, clearError: () => setError(null) }
}
