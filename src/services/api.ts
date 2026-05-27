import type { Facility, LP, BBSnapshot } from 'pe-sub-common'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  facilities: {
    list: ()                             => get<Facility[]>('/api/facilities'),
    get:  (id: number)                   => get<Facility>(`/api/facilities/${id}`),
    setStatus: (id: number, status: string) => patch<Facility>(`/api/facilities/${id}/status`, { status }),
  },
  lps: {
    list: (params: { facilityId?: number; cls?: string; search?: string }) => {
      const qs = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      )
      return get<LP[]>(`/api/lps?${qs}`)
    },
    get:    (id: number)              => get<LP>(`/api/lps/${id}`),
    update: (id: number, data: Partial<LP>) => patch<LP>(`/api/lps/${id}`, data),
  },
  bb: {
    run:       (facilityId: number)  => post<BBSnapshot>(`/api/bb/run/${facilityId}`),
    snapshots: (facilityId: number)  => get<BBSnapshot[]>(`/api/bb/snapshots/${facilityId}`),
  },
}
