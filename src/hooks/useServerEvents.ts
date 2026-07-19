import { useEffect, useRef } from 'react'

const RECONNECT_DELAY_MS = 5_000

/**
 * Subscribes to GET /api/notifications/events (SSE).
 * Calls onMessage for each 'notification' event.
 * Reconnects automatically after 5 s on disconnect.
 */
export function useServerEvents(onMessage: (msg: string) => void): void {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const connect = () => {
      if (unmounted) return
      es = new EventSource('/api/notifications/events')

      es.addEventListener('notification', (e: MessageEvent) => {
        onMessageRef.current(e.data as string)
      })

      es.onerror = () => {
        es?.close()
        es = null
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }
    }

    connect()

    return () => {
      unmounted = true
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [])
}
