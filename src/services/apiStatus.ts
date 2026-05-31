/**
 * Lightweight module-level API mode tracker.
 * Services call reportApiMode() after each call so React can display
 * a "Live" vs "Prototype" indicator in the UI.
 * Remove this file (and its callers) once the API is fully stable.
 */

export type ApiMode = 'unknown' | 'live' | 'prototype'

type Listener = (mode: ApiMode) => void

let _mode: ApiMode = 'unknown'
const _listeners = new Set<Listener>()

export function reportApiMode(mode: ApiMode): void {
  if (_mode === mode) return
  _mode = mode
  _listeners.forEach(fn => fn(mode))
}

export function getApiMode(): ApiMode { return _mode }

export function subscribeApiMode(fn: Listener): () => void {
  _listeners.add(fn)
  fn(_mode)
  return () => _listeners.delete(fn)
}
