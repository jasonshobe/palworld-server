import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getMods, uploadMod, deleteMod } from "@/api/mods"
import UploadForm from "@/components/mods/UploadForm"
import ModList from "@/components/mods/ModList"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ModsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["mods"], queryFn: getMods })
  const invalidate = () => qc.invalidateQueries({ queryKey: ["mods"] })

  const upload = useMutation({
    mutationFn: ({ file, subfolder }: { file: File; subfolder: string }) =>
      uploadMod(file, subfolder),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (path: string) => deleteMod(path),
    onSuccess: invalidate,
  })

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Mods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-300">
            Mod changes apply on the next server start.
          </p>
          <UploadForm
            disabled={upload.isPending}
            onUpload={(file, subfolder) => upload.mutate({ file, subfolder })}
          />
          {upload.isError && (
            <p className="text-sm text-red-400">{(upload.error as Error).message}</p>
          )}
          <ModList mods={data?.mods ?? []} onDelete={(p) => remove.mutate(p)} />
          {remove.isError && (
            <p className="text-sm text-red-400">{(remove.error as Error).message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
