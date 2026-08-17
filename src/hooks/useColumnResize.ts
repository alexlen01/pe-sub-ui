import { useState, useCallback, useRef, useEffect } from 'react'
import type { MouseEvent } from 'react'

export type ColWidths = Record<string, number>

const MIN_COL_WIDTH_PX = 40
const MIN_COL_WIDTH_PCT = 6

/**
 * `reservedPx` ('%' mode only): width already taken by fixed pixel columns in the same table. When
 * percentage widths describe a share of the space *left over* by those columns, the drag delta has
 * to be measured against that leftover space, otherwise the column trails behind the cursor.
 */
export function useColumnResize(storageKey: string, initial: ColWidths, widthUnit: 'px' | '%' = 'px', reservedPx = 0) {
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
    const wrapWidth = (e.currentTarget as HTMLElement | null)?.closest('.data-table-wrap')?.getBoundingClientRect().width ?? window.innerWidth
    const containerWidth = Math.max(1, wrapWidth - reservedPx)

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const delta = widthUnit === '%'
        ? ((ev.clientX - startX) / containerWidth) * 100
        : ev.clientX - startX
      const minWidth = widthUnit === '%' ? MIN_COL_WIDTH_PCT : MIN_COL_WIDTH_PX
      setWidths(prev => ({ ...prev, [col]: Math.max(minWidth, startW + delta) }))
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
  }, [widthUnit, reservedPx])

  useEffect(() => {
    try { localStorage.setItem(`col-resize:${storageKey}`, JSON.stringify(widths)) } catch { /* ignore */ }
  }, [storageKey, widths])

  const tableWidth = widthUnit === '%'
    ? '100%'
    : Object.values(widths).reduce((s, w) => s + w, 0)

  return { widths, onResizeStart, tableWidth }
}
