export type FacilityStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Needs Review'
  | 'Active'
  | 'Pending'

export interface Facility {
  id: number
  name: string
  agentBank: string
  lpCount: number
  status: FacilityStatus
  concLimitM: number
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}
