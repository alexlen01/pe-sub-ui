import { useState, useEffect } from 'react'
import { getApiMode, subscribeApiMode, type ApiMode } from '../services/apiStatus'

export function useApiMode(): ApiMode {
  const [mode, setMode] = useState<ApiMode>(getApiMode())
  useEffect(() => subscribeApiMode(setMode), [])
  return mode
}
