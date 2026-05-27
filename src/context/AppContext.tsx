import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Facility } from 'pe-sub-common'

interface AppState {
  currentFacility: Facility | null
  setCurrentFacility: (f: Facility | null) => void
  toast: (msg: string) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentFacility, setCurrentFacility] = useState<Facility | null>(null)

  const toast = (msg: string) => {
    // replace with a real toast library when UI is built out
    console.info('[toast]', msg)
  }

  return (
    <AppContext.Provider value={{ currentFacility, setCurrentFacility, toast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
