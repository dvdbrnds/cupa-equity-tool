import type { UserRole, AuditStatus, FlagReason, CupaCategory, AuditCycleStatus } from './types.js';

// ============================================================================
// User Roles
// ============================================================================

export const USER_ROLES: Record<UserRole, { label: string; description: string }> = {
  system_admin: {
    label: 'System Administrator',
    description: 'Full system access including user management and configuration',
  },
  hr_admin: {
    label: 'HR Administrator',
    description: 'Full access to positions, audits, and salary bands across all divisions',
  },
  hr_analyst: {
    label: 'HR Analyst',
    description: 'View and import access across all divisions, limited edit capabilities',
  },
  vp_reviewer: {
    label: 'VP / Division Head',
    description: 'Review and approve positions within assigned division only',
  },
  executive: {
    label: 'Executive',
    description: 'Read-only access to dashboards and reports across all divisions',
  },
  academic_dean: {
    label: 'Academic Dean',
    description: 'Review faculty positions within assigned school/department',
  },
};

// Roles that can see all divisions
export const INSTITUTION_WIDE_ROLES: UserRole[] = ['system_admin', 'hr_admin', 'hr_analyst', 'executive'];

// Roles that have full edit access
export const EDITOR_ROLES: UserRole[] = ['system_admin', 'hr_admin'];

// Roles that can manage users
export const USER_MANAGEMENT_ROLES: UserRole[] = ['system_admin'];

// ============================================================================
// Audit Status
// ============================================================================

export const AUDIT_STATUSES: Record<AuditStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'gray' },
  under_review: { label: 'Under Review', color: 'blue' },
  confirmed: { label: 'Confirmed', color: 'green' },
  flagged: { label: 'Flagged', color: 'red' },
  resolved: { label: 'Resolved', color: 'purple' },
};

// ============================================================================
// Audit Cycle Status
// ============================================================================

export const AUDIT_CYCLE_STATUSES: Record<AuditCycleStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  completed: { label: 'Completed', color: 'blue' },
  archived: { label: 'Archived', color: 'gray' },
};

// ============================================================================
// Flag Reasons
// ============================================================================

export const FLAG_REASONS: Record<FlagReason, { label: string; description: string }> = {
  wrong_cupa_code: {
    label: 'Wrong CUPA Code',
    description: 'The assigned CUPA code does not match the position duties',
  },
  job_duties_changed: {
    label: 'Job Duties Changed',
    description: 'The position responsibilities have changed since last classification',
  },
  position_eliminated: {
    label: 'Position Eliminated',
    description: 'This position no longer exists in the organization',
  },
  new_position: {
    label: 'New Position',
    description: 'This is a new position that needs initial CUPA mapping',
  },
  other: {
    label: 'Other',
    description: 'Other reason (please specify in comments)',
  },
};

// ============================================================================
// CUPA Categories
// ============================================================================

export const CUPA_CATEGORIES: Record<CupaCategory, { label: string; codeRange: string }> = {
  top_executive: {
    label: 'Top Executive Officers',
    codeRange: '100000–105000',
  },
  senior_officer: {
    label: 'Senior Institutional & Chief Functional Officers',
    codeRange: '106000–145000',
  },
  academic_dean: {
    label: 'Academic Deans',
    codeRange: '153010–155010',
  },
  institutional_admin: {
    label: 'Institutional Administrators',
    codeRange: '161000–187020',
  },
  department_head: {
    label: 'Heads of Divisions, Departments & Centers',
    codeRange: '190010–196500; 301030–301070',
  },
  associate_assistant_dean: {
    label: 'Academic Associate and Assistant Deans',
    codeRange: '304010–304410',
  },
};

// ============================================================================
// VP Stems (Senior Leadership Positions)
// ============================================================================

export const VP_STEMS = [
  'President and CEO',
  'Provost, VP for Academic Affairs, CAO',
  'Executive VP for University Life, COO',
  'VP for Finance & Administration, CFO',
  'VP for Enrollment and Marketing',
  'VP for Development and Alumni Engagement',
  'VP and Chief Information Officer',
  'Seminary Dean',
  'Chief Innovation Officer / Managing Director, SPSI',
  'VP & Dean for Equity and Inclusion, CDO',
] as const;

export type VpStem = typeof VP_STEMS[number];

// ============================================================================
// API Configuration
// ============================================================================

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation
// ============================================================================

export const CUPA_CODE_PATTERN = /^\d{6}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
