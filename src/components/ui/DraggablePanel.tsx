import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface DraggablePanelProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  storageKey?: string
}

type Point = { x: number; y: number }
const HEADER_SELECTOR = '.draggable-panel-handle, .card-header, .lp-detail-hdr'

function loadPosition(storageKey?: string): Point {
  if (!storageKey || typeof window === 'undefined') return { x: 0, y: 0 }
  try {
    const raw = window.localStorage.getItem(`draggable-panel:${storageKey}`)
    if (!raw) return { x: 0, y: 0 }
    const parsed = JSON.parse(raw) as Partial<Point>
    return {
      x: typeof parsed.x === 'number' ? parsed.x : 0,
      y: typeof parsed.y === 'number' ? parsed.y : 0,
    }
  } catch {
    return { x: 0, y: 0 }
  }
}

function savePosition(storageKey: string | undefined, point: Point) {
  if (!storageKey || typeof window === 'undefined') return
  window.localStorage.setItem(`draggable-panel:${storageKey}`, JSON.stringify(point))
}

function isInteractiveTarget(target: EventTarget | null, container: HTMLElement) {
  if (!(target instanceof HTMLElement)) return false
  const interactive = target.closest('button, a, input, select, textarea, [role="button"], [data-no-panel-drag]')
  return !!interactive && container.contains(interactive)
}

export default function DraggablePanel({ children, className, style, storageKey }: DraggablePanelProps) {
  const docked = className?.includes('lp-detail-overlay') ?? false
  const [offset, setOffset] = useState<Point>(() => loadPosition(storageKey))
  const panelRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(offset)
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null)

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  const setPanelOffset = (next: Point) => {
    setOffset(next)
    offsetRef.current = next
    savePosition(storageKey, next)
  }

  useEffect(() => {
    if (docked) return
    const panel = panelRef.current
    const header = panel?.querySelector<HTMLElement>(HEADER_SELECTOR)
    if (!header) return

    header.classList.add('draggable-panel-header')
    header.tabIndex = header.tabIndex >= 0 ? header.tabIndex : 0
    header.setAttribute('aria-label', header.getAttribute('aria-label') || 'Move panel')

    const onDoubleClick = (e: MouseEvent) => {
      if (isInteractiveTarget(e.target, header)) return
      e.stopPropagation()
      setPanelOffset({ x: 0, y: 0 })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target, header)) return
      const step = e.shiftKey ? 30 : 10
      if (e.key === 'Home') {
        e.preventDefault()
        setPanelOffset({ x: 0, y: 0 })
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      const current = offsetRef.current
      setPanelOffset({
        x: current.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
        y: current.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
      })
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractiveTarget(e.target, header)) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = {
        pointerId: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        origin: offsetRef.current,
      }
      header.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const next = {
        x: drag.origin.x + e.clientX - drag.start.x,
        y: drag.origin.y + e.clientY - drag.start.y,
      }
      offsetRef.current = next
      setOffset(next)
    }

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const next = {
        x: drag.origin.x + e.clientX - drag.start.x,
        y: drag.origin.y + e.clientY - drag.start.y,
      }
      dragRef.current = null
      setPanelOffset(next)
      if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId)
    }

    const onPointerCancel = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
    }

    header.addEventListener('dblclick', onDoubleClick)
    header.addEventListener('keydown', onKeyDown)
    header.addEventListener('pointerdown', onPointerDown)
    header.addEventListener('pointermove', onPointerMove)
    header.addEventListener('pointerup', onPointerUp)
    header.addEventListener('pointercancel', onPointerCancel)

    return () => {
      header.removeEventListener('dblclick', onDoubleClick)
      header.removeEventListener('keydown', onKeyDown)
      header.removeEventListener('pointerdown', onPointerDown)
      header.removeEventListener('pointermove', onPointerMove)
      header.removeEventListener('pointerup', onPointerUp)
      header.removeEventListener('pointercancel', onPointerCancel)
      header.classList.remove('draggable-panel-header')
    }
  }, [children, docked, storageKey])

  return (
    <div
      ref={panelRef}
      className={['draggable-panel', className].filter(Boolean).join(' ')}
      style={{
        ...style,
        transform: docked ? undefined : `translate(${offset.x}px, ${offset.y}px)`,
        position: style?.position ?? (className?.includes('lp-detail-overlay') ? undefined : 'relative'),
        zIndex: docked ? style?.zIndex : offset.x || offset.y ? 60 : style?.zIndex,
      }}
    >
      {children}
    </div>
  )
}
