import { useEffect, useRef } from "react"

export default function LogViewer({ lines }: { lines: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines])

  return (
    <div className="bg-black rounded-md p-3 h-64 overflow-y-auto font-mono text-xs text-green-400">
      {lines.length === 0
        ? <span className="text-slate-500">No output yet.</span>
        : lines.map((line, i) => <div key={i}>{line}</div>)
      }
      <div ref={bottomRef} />
    </div>
  )
}
