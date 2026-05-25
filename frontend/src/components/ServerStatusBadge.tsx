import { Badge } from "@/components/ui/badge"
import type { ServerState } from "@/types"

const STATE_CONFIG: Record<ServerState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  stopped: { label: "Stopped", variant: "secondary" },
  starting: { label: "Starting...", variant: "outline" },
  running: { label: "Running", variant: "default" },
  stopping: { label: "Stopping...", variant: "outline" },
  updating: { label: "Updating...", variant: "outline" },
}

export default function ServerStatusBadge({ state }: { state: ServerState }) {
  const { label, variant } = STATE_CONFIG[state]
  return <Badge variant={variant}>{label}</Badge>
}
