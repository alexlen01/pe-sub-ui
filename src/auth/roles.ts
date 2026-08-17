// Role model and capability map for client-side authorization (UI gating).
//
// IMPORTANT: UI gating is for usability only. Every permission is enforced server-side by
// pe-sub-api (SecurityConfig + controller checks). A disabled button here mirrors a server
// decision; it never *is* the decision. See pe-sub-docs/RBAC_ROLES.md.
//
// The Spring role tokens (ANALYST / MANAGER / VIEWER) match what the API's SecurityConfig checks and
// what the dev sign-in gate sends in X-Auth-Roles. The external Intra ID App Roles map to them:
// APP_ANALYST → ANALYST, APP_MANAGER → MANAGER, APP_VIEWER → VIEWER.

export type Role = 'ANALYST' | 'MANAGER' | 'VIEWER'

export type Capability =
  | 'upload'          // upload Agent BB, run extraction / matching
  | 'runShadowBB'     // run / recalculate Shadow BB and submit it for review
  | 'reviewShadowBB'  // accept or reject a completed Shadow BB (independent review)
  | 'editConfig'      // edit configuration, thresholds, mappings, templates
  | 'editLp'          // edit LP records / LP Master classification
  | 'delete'          // delete records
  | 'download'        // export / download reports

// Presentation metadata only. The identity signed in at the dev gate and sent as X-Auth-* comes
// from USERS in navigationConfig (uuName-keyed, e.g. js25029) via session.ts — not from here.
// `label` is the join key between the two: see roleFromLabel below.
export interface RoleMeta {
  role:       Role
  label:      string   // presentation label shown in the UI
  initials:   string
  department: string
  color:      string   // CSS var for the avatar / role badge
}

export const ROLES: Record<Role, RoleMeta> = {
  ANALYST: {
    role: 'ANALYST', label: 'Analyst', initials: 'JS',
    department: 'PE Sub Finance', color: 'var(--navy)',
  },
  MANAGER: {
    role: 'MANAGER', label: 'Account/Transaction Manager', initials: 'LT',
    department: 'PE Sub Finance', color: 'var(--amber)',
  },
  VIEWER: {
    role: 'VIEWER', label: 'IT — Read Only', initials: 'AL',
    department: 'IT Support', color: 'var(--muted)',
  },
}

// Maps a display-role string back to a Role token — used for both the server's
// CurrentUserService.displayRole and the role on the dev USERS entries, so the two can never drift
// apart. Anything unrecognised (Service, unknown) collapses to the least-privileged VIEWER so the
// UI never grants operator affordances it can't justify.
export function roleFromLabel(label: string): Role {
  return (Object.keys(ROLES) as Role[]).find(role => ROLES[role].label === label) ?? 'VIEWER'
}

// Capability grants per role, mirroring the RBAC_ROLES.md permission matrix:
//  - Analyst: operates + configures, but cannot perform independent review of any work.
//  - Manager (MANAGER): operates + reviews (accept/reject), but does NOT edit configuration.
//  - Viewer (IT): read-only; may download/export but never create, edit, delete, or upload.
const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  ANALYST: new Set(['upload', 'runShadowBB', 'editConfig', 'editLp', 'delete', 'download']),
  MANAGER:     new Set(['upload', 'runShadowBB', 'reviewShadowBB', 'editLp', 'delete', 'download']),
  VIEWER:  new Set(['download']),
}

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].has(capability)
}
