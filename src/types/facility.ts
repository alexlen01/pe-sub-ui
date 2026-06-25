export type FacilityStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Needs Review'
  | 'Active'
  | 'Pending'
  | 'Inactive'

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
  collateralDate: string | null
  bankStatus: string | null
  bankStatusDate: string | null
  // Latest Shadow BB figures from the most recent snapshot ($millions); null until a BB is run.
  agentBB: number | null
  ubsBB: number | null
  bbDelta: number | null
  ear: number | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}
