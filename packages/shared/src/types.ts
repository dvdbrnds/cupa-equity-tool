// ============================================================================
// User & Authentication Types
// ============================================================================

export type UserRole = 
  | 'system_admin' 
  | 'hr_admin' 
  | 'hr_analyst' 
  | 'vp_reviewer' 
  | 'executive' 
  | 'academic_dean';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  division: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface AuthSession {
  user: User;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// ============================================================================
// CUPA Catalog Types
// ============================================================================

export type CupaPopulationType = 'staff' | 'faculty';

export type CupaCategory = 
  | 'top_executive'
  | 'senior_officer'
  | 'academic_dean'
  | 'institutional_admin'
  | 'department_head'
  | 'associate_assistant_dean';

export interface CupaPosition {
  cupaCode: string;
  title: string;
  description: string;
  category: CupaCategory | null;
  blsSocCode: string | null;
  blsSocName: string | null;
  populationType: CupaPopulationType;
  catalogYear: string;
}

// ============================================================================
// Position Mapping Types
// ============================================================================

export type AuditStatus = 
  | 'pending' 
  | 'under_review' 
  | 'confirmed' 
  | 'flagged' 
  | 'resolved';

export type CompensationType = 'salaried' | 'hourly';

export interface PositionMapping {
  id: number;
  employeeId: string;
  cupaCode: string | null;
  institutionalTitle: string;
  employeeName: string;
  division: string;
  department: string;
  supervisor: string | null;
  vpStem: string;
  auditStatus: AuditStatus;
  assignedReviewerId: number | null;
  reviewDate: string | null;
  createdAt: string;
  // Compensation fields
  currentSalary?: number | null;
  hireDate?: string | null;
  fte?: number;
  appointmentMonths?: number;
  compensationType?: CompensationType;
  hasHousingBenefit?: boolean;
  housingValue?: number;
}

export interface PositionMappingWithCupa extends PositionMapping {
  cupaTitle: string | null;
  cupaDescription: string | null;
  reviewerName: string | null;
}

// ============================================================================
// Audit Cycle Types
// ============================================================================

export type AuditCycleStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface AuditCycle {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  status: AuditCycleStatus;
  createdById: number;
  createdAt: string;
}

export interface AuditCycleWithStats extends AuditCycle {
  totalPositions: number;
  pendingCount: number;
  confirmedCount: number;
  flaggedCount: number;
  resolvedCount: number;
}

// ============================================================================
// Review & Comment Types
// ============================================================================

export type FlagReason = 
  | 'wrong_cupa_code'
  | 'job_duties_changed'
  | 'position_eliminated'
  | 'new_position'
  | 'other';

export interface ReviewComment {
  id: number;
  positionMappingId: number;
  userId: number;
  comment: string;
  flagReason: FlagReason | null;
  suggestedCupaCode: string | null;
  createdAt: string;
}

export interface ReviewCommentWithUser extends ReviewComment {
  userName: string;
  userRole: UserRole;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}

// ============================================================================
// Import Types
// ============================================================================

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ImportValidationError[];
}

// ============================================================================
// VP Role Types
// ============================================================================

export interface VpRole {
  id: number;
  code: string;
  title: string;
  description: string | null;
  assignedEmail: string | null;
  assignedName: string | null;
  positionCount: number;
  createdAt: string;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface AuditProgressByVp {
  vpStem: string;
  vpTitle: string | null;
  totalPositions: number;
  pending: number;
  confirmed: number;
  flagged: number;
  resolved: number;
}

export interface DashboardStats {
  totalPositions: number;
  mappedPositions: number;
  unmappedPositions: number;
  totalCupaCodes: number;
  activeAuditCycles: number;
  pendingReviews: number;
}

// ============================================================================
// CUPA Salary Data Types
// ============================================================================

export interface CupaSalaryData {
  id: number;
  cupaCode: string;
  dataYear: string;
  medianSalary: number;
  percentile25: number | null;
  percentile75: number | null;
  sampleCount: number | null;
  createdAt: string;
}

// ============================================================================
// Equity Analysis Types
// ============================================================================

export interface EquityAnalysis {
  id: number;
  auditCycleId?: number; // Deprecated, kept for compatibility
  positionMappingId: number;
  baseMedian: number | null;
  adjustedMedian: number | null;
  totalCompensation: number | null;
  equityGap: number | null;
  gapPercentage: number | null;
  yearsInRole: number | null;
  proposedRaise: number;
  adjustmentNotes: string | null;
  calculatedAt: string;
}

export interface EquityAnalysisWithPosition extends EquityAnalysis {
  employeeId: string;
  employeeName: string;
  institutionalTitle: string;
  cupaCode: string | null;
  cupaTitle: string | null;
  vpStem: string;
  division: string;
  department: string;
  currentSalary: number | null;
  fte: number;
  appointmentMonths: number;
  compensationType: CompensationType;
  hasHousingBenefit: boolean;
}

export interface ProposedRaise {
  positionMappingId: number;
  employeeName: string;
  vpStem: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number;
  newSalary: number | null;
  remainingGap: number | null;
}

export interface EquitySummaryByVp {
  vpStem: string;
  vpTitle: string | null;
  positionCount: number;
  analyzedCount: number;
  underpaidCount: number;
  totalGap: number;
  averageGap: number;
  averageGapPercentage: number;
  salariedCount: number;
  hourlyCount: number;
  salariedGap: number;
  hourlyGap: number;
}

export interface BudgetAllocation {
  vpStem: string;
  vpTitle: string | null;
  totalGap: number;
  gapPercentage: number;
  allocatedBudget: number;
  positionCount: number;
}

export interface EquityAnalysisSummary {
  totalPositions: number;
  analyzedPositions: number;
  positionsWithGap: number;
  totalGap: number;
  averageGap: number;
  medianGap: number;
  calculatedAt: string | null;
}

// ============================================================================
// Equity Review Cycle Types (Workflow)
// ============================================================================

export type ReviewCycleStatus = 
  | 'draft' 
  | 'calculating' 
  | 'pending_vp_review' 
  | 'vp_review_in_progress' 
  | 'hr_final_review' 
  | 'pending_pc_approval'  // Submitted to President's Cabinet for vote
  | 'pc_approved'          // PC has approved, ready for implementation
  | 'pc_rejected'          // PC has rejected, needs revision
  | 'approved' 
  | 'implemented' 
  | 'archived';

export type VpReviewStatus = 
  | 'pending' 
  | 'in_review' 
  | 'approved' 
  | 'changes_requested' 
  | 'hr_revised'
  | 'finalized';

export type EmployeeFeedbackType = 
  | 'approve' 
  | 'increase' 
  | 'decrease' 
  | 'defer' 
  | 'discuss';

export interface EquityReviewCycle {
  id: number;
  name: string;
  fiscalYear: string;
  totalBudget: number | null;
  status: ReviewCycleStatus;
  cupaDataYear: string | null;
  deadline: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  // PC (President's Cabinet) approval tracking
  pcSubmittedAt: string | null;
  pcSubmittedById: number | null;
  pcVoteDate: string | null;
  pcVoteResult: 'approved' | 'rejected' | null;
  pcVoteNotes: string | null;
}

export interface EquityReviewCycleWithStats extends EquityReviewCycle {
  vpCount: number;
  pendingVpCount: number;
  approvedVpCount: number;
  totalProposed: number;
  totalAllocated: number;
  createdByName: string;
}

export interface VpReviewStatusRecord {
  id: number;
  cycleId: number;
  vpStem: string;
  vpTitle: string | null;
  status: VpReviewStatus;
  allocatedBudget: number | null;
  proposedTotal: number | null;
  employeeCount: number | null;
  sentAt: string | null;
  reviewedAt: string | null;
  reviewedById: number | null;
  reviewedByName: string | null;
  notes: string | null;
  createdAt: string;
  // VP supplemental funding offer
  vpSupplementalOffer: number | null;
  supplementalOfferNotes: string | null;
  supplementalOfferedAt: string | null;
  // HR final approval
  hrApprovedAt: string | null;
  hrApprovedById: number | null;
  hrApprovedByName: string | null;
}

export interface EmployeeFeedback {
  id: number;
  cycleId: number;
  positionMappingId: number;
  feedbackType: EmployeeFeedbackType;
  adjustedRaise: number | null;
  notes: string | null;
  createdById: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFeedbackWithDetails extends EmployeeFeedback {
  employeeId: string;
  employeeName: string;
  institutionalTitle: string;
  department: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number | null;
}
