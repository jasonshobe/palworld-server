import { useEffect, useRef, useCallback } from "react"

// Returns a stable callback that defers invoking `fn` until `delay` ms after the
// last call. Used so slider/number drags fire one PATCH instead of many.
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay = 400,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    const t = timer
    return () => {
      if (t.current) clearTimeout(t.current)
    }
  }, [])

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  )
}
