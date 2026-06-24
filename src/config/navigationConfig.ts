// Application-wide navigation, branding, and user identity.
// Replace CURRENT_USER with an auth context or API call when auth is added.

export interface User {
  name:          string
  initials:      string
  role:          string
  department:    string
  notifications: number
}

export const APP_TITLE    = 'PE Sub Platform'
export const APP_SUBTITLE = 'Borrowing Base & Collateral Analysis'

export const USERS: User[] = [
  { name: 'J. Smith',  initials: 'JS', role: 'Analyst',                    department: 'PE Sub Finance', notifications: 3 },
  { name: 'M. Chen',   initials: 'MC', role: 'Analyst',                    department: 'PE Sub Finance', notifications: 1 },
  { name: 'L. Torres', initials: 'LT', role: 'Account/Transaction Manager', department: 'PE Sub Finance', notifications: 5 },
]

export const DEFAULT_USER: User = USERS[0]

// Maps wizard sub-screens to their parent nav item so the sidebar stays highlighted.
export const SCREEN_NAV_PARENT: Record<string, string> = {
  'extraction-preview': 'upload',
  'match-queue':        'upload',
  'match-thresholds':   'upload',
  'run-shadow-bb':      'upload',
  'field-mapping':      'upload',
  'bb-templates':       'upload',
}

export type NavSection = { section: string }
export type NavItem = { id: string; icon: string; label: string }
export type NavEntry = NavSection | NavItem

export const NAV: NavEntry[] = [
  { section: 'Overview' },
  { id: 'dashboard',     icon: '▦', label: 'Dashboard'      },
  { section: 'Operations' },
  { id: 'upload',        icon: '↑', label: 'Upload Agent BB' },
  { id: 'shadow-bb',     icon: '◈', label: 'Shadow BB'       },
  { id: 'lp-master',     icon: '☰', label: 'LP Master'       },
  { section: 'Insights' },
  { id: 'reports',       icon: '◫', label: 'Reports'         },
  { section: 'Admin' },
  { id: 'configuration', icon: '⚙', label: 'Configuration'   },
  { id: 'audit',         icon: '!', label: 'Audit Trail'      },
]
