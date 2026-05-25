import { useQuery } from "@tanstack/react-query"
import { getServerStatus } from "@/api/server"

export function useServerStatus() {
  return useQuery({
    queryKey: ["serverStatus"],
    queryFn: getServerStatus,
    refetchInterval: 2000,
  })
}
