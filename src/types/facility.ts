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
  accountNumber: string | null
  loanAmount: number | null
  facilitySize: number | null
  ubsParticipation: number | null
  maturityDate: string | null
  bankStatus: string | null
  bankStatusDate: string | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}
