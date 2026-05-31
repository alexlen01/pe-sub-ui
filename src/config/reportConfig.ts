export interface ReportTab {
  id:    string
  label: string
}

export interface ReportSchedule {
  name: string
  freq: string
  next: string
}

export const REPORT_TABS: ReportTab[] = [
  { id: 'collateral',    label: 'Collateral & Coverage'  },
  { id: 'ear',           label: 'Effective Advance Rates'},
  { id: 'agent-bank',    label: 'Agent Bank Exposure'    },
  { id: 'concentration', label: 'Concentration Exposures'},
  { id: 'adhoc',         label: 'Ad Hoc Reporting'       },
  { id: 'scheduled',     label: 'Scheduled Reports'      },
]

export const CONCENTRATION_TESTS: string[] = [
  'Single-LP limit breach (>15% of UBS BB)',
  'Top-10 LP concentration breach (>60% of UBS BB)',
  'Unrated aggregate exposure (>50% of UBS BB)',
  'Non-US LP aggregate exposure (>30% of UBS BB)',
]

export const REPORT_SCHEDULES: ReportSchedule[] = [
  { name: 'Monthly Status Reset — All Active Facilities', freq: '1st of month, 00:00', next: 'Jun 1' },
]
