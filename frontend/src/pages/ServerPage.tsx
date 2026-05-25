import { useMutation, useQueryClient } from "@tanstack/react-query"
import { startServer, stopServer, updateServer } from "@/api/server"
import { useServerStatus } from "@/hooks/useServerStatus"
import ServerStatusBadge from "@/components/ServerStatusBadge"
import LogViewer from "@/components/LogViewer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ServerPage() {
  const { data } = useServerStatus()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["serverStatus"] })

  const startMut = useMutation({ mutationFn: startServer, onSuccess: invalidate })
  const stopMut = useMutation({ mutationFn: stopServer, onSuccess: invalidate })
  const updateMut = useMutation({ mutationFn: updateServer, onSuccess: invalidate })

  const state = data?.state ?? "stopped"
  const logs = data?.logs ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <CardTitle>Server Status</CardTitle>
          <ServerStatusBadge state={state} />
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            onClick={() => startMut.mutate()}
            disabled={state !== "stopped" || startMut.isPending}
          >
            Start
          </Button>
          <Button
            variant="destructive"
            onClick={() => stopMut.mutate()}
            disabled={state !== "running" || stopMut.isPending}
          >
            Stop
          </Button>
          <Button
            variant="outline"
            onClick={() => updateMut.mutate()}
            disabled={state !== "stopped" || updateMut.isPending}
          >
            Update
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Server Log</CardTitle></CardHeader>
        <CardContent><LogViewer lines={logs} /></CardContent>
      </Card>
    </div>
  )
}
