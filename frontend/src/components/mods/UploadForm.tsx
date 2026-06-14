import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  onUpload: (file: File, subfolder: string) => void
  disabled?: boolean
}

export default function UploadForm({ onUpload, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [subfolder, setSubfolder] = useState("")

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (file) {
          onUpload(file, subfolder.trim())
          setFile(null)
          setSubfolder("")
          ;(e.target as HTMLFormElement).reset()
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Mod file (.pak / .utoc / .ucas)</label>
        <input
          type="file"
          accept=".pak,.utoc,.ucas"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Subfolder (optional)</label>
        <input
          type="text"
          value={subfolder}
          placeholder="e.g. LogicMods"
          className="rounded border bg-transparent px-2 py-1 text-sm"
          onChange={(e) => setSubfolder(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={disabled || !file}>
        Upload
      </Button>
    </form>
  )
}
