import { useState, useCallback, useRef, useEffect } from 'react'
import type { MouseEvent } from 'react'

export type ColWidths = Record<string, number>

const MIN_COL_WIDTH = 40

export function useColumnResize(storageKey: string, initial: ColWidths) {
  const [widths, setWidths] = useState<ColWidths>(() => {
    try {
      const stored = localStorage.getItem(`col-resize:${storageKey}`)
      if (stored) return { ...initial, ...JSON.parse(stored) }
    } catch { /* ignore */ }
    return { ...initial }
  })

  // Ref so mouseMove handlers always read current widths without stale closure
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  const onResizeStart = useCallback((col: string, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthsRef.current[col] ?? 100

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      setWidths(prev => ({ ...prev, [col]: Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX) }))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(`col-resize:${storageKey}`, JSON.stringify(widths)) } catch { /* ignore */ }
  }, [storageKey, widths])

  const tableWidth = Object.values(widths).reduce((s, w) => s + w, 0)

  return { widths, onResizeStart, tableWidth }
}
