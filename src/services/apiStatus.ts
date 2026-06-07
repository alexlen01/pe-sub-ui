// Retained as a no-op shim during migration to per-screen mode (AppContext.screenMode).
// All reportApiMode calls have been removed from service files.
// This file can be deleted once no imports remain.

export type ApiMode = 'unknown' | 'live' | 'prototype'

export function reportApiMode(_mode: ApiMode): void { /* no-op */ }
export function getApiMode(): ApiMode { return 'unknown' }
export function subscribeApiMode(_fn: (mode: ApiMode) => void): () => void { return () => {} }
