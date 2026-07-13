// Application-wide navigation, branding, and local dev user identity.

export interface User {
  uuName:        string
  firstName:     string
  lastName:      string
  email:         string
  name:          string
  initials:      string
  role:          string
  department:    string
  notifications: number
}

export const APP_TITLE    = 'PE Sub Platform'
export const APP_SUBTITLE = 'Borrowing Base & Collateral Analysis'

function user(uuName: string, firstName: string, lastName: string, email: string, role: string, notifications: number): User {
  return {
    uuName,
    firstName,
    lastName,
    email,
    name: `${firstName} ${lastName}`.trim(),
    initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
    role,
    department: 'PE Sub Finance',
    notifications,
  }
}

export const USERS: User[] = [
  user('js25029', 'J.', 'Smith',  'john.smith@ubs.com',  'Analyst', 3),
  user('mc48102', 'M.', 'Chen',   'mary.chen@ubs.com',   'Analyst', 1),
  user('lt09341', 'L.', 'Torres', 'lisa.torres@ubs.com', 'Account/Transaction Manager', 5),
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
