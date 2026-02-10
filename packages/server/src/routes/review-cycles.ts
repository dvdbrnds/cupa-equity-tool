import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, saveDatabase } from '../db/init.js';
import { requireAuth, requireEditor, getDivisionFilter, type AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error-handler.js';
import { getEquitySummaryByVp, calculateBudgetAllocation } from '../services/equity-calculator.js';
import { generatePcReport } from '../services/pc-report-generator.js';
import type { 
  EquityReviewCycleWithStats, 
  ReviewCycleStatus,
  VpReviewStatus,
  EmployeeFeedbackType
} from '@cupa/shared';

export const reviewCyclesRouter = Router();
reviewCyclesRouter.use(requireAuth);

// ============================================
// Review Cycle Management (HR only)
// ============================================

// List all review cycles
reviewCyclesRouter.get('/', (req: Request, res: Response) => {
  const includeArchived = req.query.includeArchived === 'true';
  
  let whereClause = includeArchived ? '' : "WHERE rc.status != 'archived'";
  
  const cycles = dbAll<Record<string, unknown>>(`
    SELECT 
      rc.*,
      u.name as created_by_name,
      (SELECT COUNT(DISTINCT vp_stem) FROM vp_review_status WHERE cycle_id = rc.id) as vp_count,
      (SELECT COUNT(*) FROM vp_review_status WHERE cycle_id = rc.id AND status = 'pending') as pending_vp_count,
      (SELECT COUNT(*) FROM vp_review_status WHERE cycle_id = rc.id AND status = 'approved') as approved_vp_count,
      (SELECT COALESCE(SUM(proposed_total), 0) FROM vp_review_status WHERE cycle_id = rc.id) as total_proposed,
      (SELECT COALESCE(SUM(allocated_budget), 0) FROM vp_review_status WHERE cycle_id = rc.id) as total_allocated
    FROM equity_review_cycles rc
    LEFT JOIN users u ON rc.created_by_id = u.id
    ${whereClause}
    ORDER BY rc.created_at DESC
  `);
  
  const result: EquityReviewCycleWithStats[] = cycles.map(row => ({
    id: row.id as number,
    name: row.name as string,
    fiscalYear: row.fiscal_year as string,
    totalBudget: row.total_budget as number | null,
    status: row.status as ReviewCycleStatus,
    cupaDataYear: row.cupa_data_year as string | null,
    deadline: row.deadline as string | null,
    createdById: row.created_by_id as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    notes: row.notes as string | null,
    pcSubmittedAt: row.pc_submitted_at as string | null,
    pcSubmittedById: row.pc_submitted_by_id as number | null,
    pcVoteDate: row.pc_vote_date as string | null,
    pcVoteResult: row.pc_vote_result as 'approved' | 'rejected' | null,
    pcVoteNotes: row.pc_vote_notes as string | null,
    vpCount: row.vp_count as number,
    pendingVpCount: row.pending_vp_count as number,
    approvedVpCount: row.approved_vp_count as number,
    totalProposed: row.total_proposed as number,
    totalAllocated: row.total_allocated as number,
    createdByName: row.created_by_name as string,
  }));
  
  res.json(result);
});

// Get single review cycle with VP breakdown
reviewCyclesRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  const cycle = dbGet<Record<string, unknown>>(`
    SELECT 
      rc.*,
      u.name as created_by_name
    FROM equity_review_cycles rc
    LEFT JOIN users u ON rc.created_by_id = u.id
    WHERE rc.id = ?
  `, [id]);
  
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  // Get VP review statuses for this cycle
  const vpStatuses = dbAll<Record<string, unknown>>(`
    SELECT 
      vrs.*,
      vr.title as vp_title,
      u.name as reviewed_by_name,
      u2.name as hr_approved_by_name
    FROM vp_review_status vrs
    LEFT JOIN vp_roles vr ON vrs.vp_stem = vr.code
    LEFT JOIN users u ON vrs.reviewed_by_id = u.id
    LEFT JOIN users u2 ON vrs.hr_approved_by_id = u2.id
    WHERE vrs.cycle_id = ?
    ORDER BY vr.title
  `, [id]);
  
  res.json({
    cycle: {
      id: cycle.id as number,
      name: cycle.name as string,
      fiscalYear: cycle.fiscal_year as string,
      totalBudget: cycle.total_budget as number | null,
      status: cycle.status as ReviewCycleStatus,
      cupaDataYear: cycle.cupa_data_year as string | null,
      deadline: cycle.deadline as string | null,
      createdById: cycle.created_by_id as number,
      createdAt: cycle.created_at as string,
      updatedAt: cycle.updated_at as string,
      notes: cycle.notes as string | null,
      createdByName: cycle.created_by_name as string,
      // PC approval tracking
      pcSubmittedAt: cycle.pc_submitted_at as string | null,
      pcSubmittedById: cycle.pc_submitted_by_id as number | null,
      pcVoteDate: cycle.pc_vote_date as string | null,
      pcVoteResult: cycle.pc_vote_result as 'approved' | 'rejected' | null,
      pcVoteNotes: cycle.pc_vote_notes as string | null,
    },
    vpStatuses: vpStatuses.map(row => ({
      id: row.id as number,
      cycleId: row.cycle_id as number,
      vpStem: row.vp_stem as string,
      vpTitle: row.vp_title as string | null,
      status: row.status as VpReviewStatus,
      allocatedBudget: row.allocated_budget as number | null,
      proposedTotal: row.proposed_total as number | null,
      employeeCount: row.employee_count as number | null,
      sentAt: row.sent_at as string | null,
      reviewedAt: row.reviewed_at as string | null,
      reviewedById: row.reviewed_by_id as number | null,
      reviewedByName: row.reviewed_by_name as string | null,
      notes: row.notes as string | null,
      createdAt: row.created_at as string,
      vpSupplementalOffer: row.vp_supplemental_offer as number | null,
      supplementalOfferNotes: row.supplemental_offer_notes as string | null,
      supplementalOfferedAt: row.supplemental_offered_at as string | null,
      hrApprovedAt: row.hr_approved_at as string | null,
      hrApprovedById: row.hr_approved_by_id as number | null,
      hrApprovedByName: row.hr_approved_by_name as string | null,
    })),
  });
});

// Create new review cycle
const createCycleSchema = z.object({
  name: z.string().min(1),
  fiscalYear: z.string().min(1),
  totalBudget: z.number().positive().optional(),
  cupaDataYear: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
});

reviewCyclesRouter.post('/', requireEditor, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { name, fiscalYear, totalBudget, cupaDataYear, deadline, notes } = createCycleSchema.parse(req.body);
  
  const result = dbRun(`
    INSERT INTO equity_review_cycles (name, fiscal_year, total_budget, cupa_data_year, deadline, notes, created_by_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `, [name, fiscalYear, totalBudget ?? 100000, cupaDataYear || null, deadline || null, notes || null, authReq.user.userId]);
  
  res.status(201).json({ 
    success: true, 
    id: result.lastInsertRowid,
    message: 'Review cycle created'
  });
});

// Update review cycle
const updateCycleSchema = z.object({
  name: z.string().min(1).optional(),
  totalBudget: z.number().positive().optional(),
  cupaDataYear: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['draft', 'calculating', 'pending_vp_review', 'vp_review_in_progress', 'hr_final_review', 'approved', 'implemented', 'archived']).optional(),
});

reviewCyclesRouter.patch('/:id', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = updateCycleSchema.parse(req.body);
  
  // Build dynamic update query
  const setClauses: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  
  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.totalBudget !== undefined) {
    setClauses.push('total_budget = ?');
    params.push(updates.totalBudget);
  }
  if (updates.cupaDataYear !== undefined) {
    setClauses.push('cupa_data_year = ?');
    params.push(updates.cupaDataYear);
  }
  if (updates.deadline !== undefined) {
    setClauses.push('deadline = ?');
    params.push(updates.deadline);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    params.push(updates.notes);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  
  params.push(id);
  
  dbRun(`UPDATE equity_review_cycles SET ${setClauses.join(', ')} WHERE id = ?`, params);
  
  res.json({ success: true, message: 'Review cycle updated' });
});

// Preview VP allocations (dry-run calculation without saving)
reviewCyclesRouter.post('/preview-allocations', requireEditor, (req: Request, res: Response) => {
  const { totalBudget } = req.body;
  
  if (!totalBudget || totalBudget <= 0) {
    throw new BadRequestError('Total budget is required and must be positive');
  }
  
  const vpSummary = getEquitySummaryByVp();
  const allocations = calculateBudgetAllocation(totalBudget);
  
  const overallTotalGap = vpSummary.reduce((sum, vp) => sum + Math.max(0, vp.totalGap), 0);
  
  res.json({
    allocations: allocations.map(a => {
      const vpData = vpSummary.find(v => v.vpStem === a.vpStem);
      return {
        ...a,
        underpaidCount: vpData?.underpaidCount || 0,
        analyzedCount: vpData?.analyzedCount || 0,
      };
    }),
    overallTotalGap,
    totalBudget,
  });
});

// Initialize VP allocations for a cycle (based on current equity analysis)
reviewCyclesRouter.post('/:id/initialize-allocations', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const { totalBudget } = req.body;
  
  // Get the cycle
  const cycle = dbGet<{ status: string; total_budget: number | null }>('SELECT status, total_budget FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  const budget = totalBudget || cycle.total_budget;
  if (!budget || budget <= 0) {
    throw new BadRequestError('Total budget must be set before initializing allocations');
  }
  
  // Get VP equity summary and calculate allocations
  const vpSummary = getEquitySummaryByVp();
  const allocations = calculateBudgetAllocation(budget);
  
  // Clear existing VP statuses for this cycle
  dbRun('DELETE FROM vp_review_status WHERE cycle_id = ?', [id]);
  
  // Create VP status records with allocated budgets
  for (const alloc of allocations) {
    const vpData = vpSummary.find(v => v.vpStem === alloc.vpStem);
    
    dbRun(`
      INSERT INTO vp_review_status (cycle_id, vp_stem, status, allocated_budget, proposed_total, employee_count)
      VALUES (?, ?, 'pending', ?, ?, ?)
    `, [id, alloc.vpStem, alloc.allocatedBudget, alloc.totalGap, vpData?.positionCount || 0]);
  }
  
  // Update cycle with budget and status
  dbRun(`
    UPDATE equity_review_cycles 
    SET total_budget = ?, status = 'pending_vp_review', updated_at = datetime('now')
    WHERE id = ?
  `, [budget, id]);
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: `Initialized allocations for ${allocations.length} VP divisions`,
    allocations
  });
});

// Update a specific VP's allocation (manual override)
reviewCyclesRouter.patch('/:id/vp-allocation/:vpStem', requireEditor, (req: Request, res: Response) => {
  const { id, vpStem } = req.params;
  const { allocatedBudget } = req.body;
  
  if (typeof allocatedBudget !== 'number' || allocatedBudget < 0) {
    throw new BadRequestError('Allocated budget must be a non-negative number');
  }
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  // Check if VP status exists
  const vpStatus = dbGet<{ id: number }>('SELECT id FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?', [id, vpStem]);
  
  if (vpStatus) {
    // Update existing
    dbRun(`
      UPDATE vp_review_status 
      SET allocated_budget = ?, updated_at = datetime('now')
      WHERE cycle_id = ? AND vp_stem = ?
    `, [allocatedBudget, id, vpStem]);
  } else {
    // Create new VP status record
    dbRun(`
      INSERT INTO vp_review_status (cycle_id, vp_stem, status, allocated_budget, proposed_total, employee_count)
      VALUES (?, ?, 'pending', ?, 0, 0)
    `, [id, vpStem, allocatedBudget]);
  }
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: `Updated allocation for ${vpStem} to ${allocatedBudget}`,
    vpStem,
    allocatedBudget
  });
});

// Send review to VPs (mark as ready for VP review)
reviewCyclesRouter.post('/:id/send-to-vps', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const { vpStems } = req.body; // Optional: specific VPs to send to
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  let whereClause = 'cycle_id = ?';
  const params: unknown[] = [id];
  
  if (vpStems && Array.isArray(vpStems) && vpStems.length > 0) {
    whereClause += ` AND vp_stem IN (${vpStems.map(() => '?').join(',')})`;
    params.push(...vpStems);
  }
  
  // Update VP statuses to 'in_review' and set sent_at
  const result = dbRun(`
    UPDATE vp_review_status 
    SET status = 'in_review', sent_at = datetime('now')
    WHERE ${whereClause} AND status = 'pending'
  `, params);
  
  // Update cycle status
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = 'vp_review_in_progress', updated_at = datetime('now')
    WHERE id = ?
  `, [id]);
  
  res.json({ 
    success: true, 
    message: `Sent review to ${result.changes} VP(s)`,
    sentCount: result.changes
  });
});

// ============================================
// VP Review Actions
// ============================================

// Get current user's reviews (all statuses for review queue page)
reviewCyclesRouter.get('/my-reviews/pending', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);
  
  if (!divisionFilter) {
    // Institution-wide users don't have "my reviews"
    res.json([]);
    return;
  }
  
  // Return all reviews (not just pending) so VPs can see their history
  // Exclude archived cycles from the list
  const reviews = dbAll<Record<string, unknown>>(`
    SELECT 
      vrs.*,
      vr.title as vp_title,
      rc.name as cycle_name,
      rc.fiscal_year,
      rc.deadline,
      rc.total_budget as cycle_total_budget
    FROM vp_review_status vrs
    JOIN equity_review_cycles rc ON vrs.cycle_id = rc.id
    LEFT JOIN vp_roles vr ON vrs.vp_stem = vr.code
    WHERE vrs.vp_stem = ? 
      AND rc.status != 'archived'
    ORDER BY 
      CASE vrs.status 
        WHEN 'in_review' THEN 1 
        WHEN 'hr_revised' THEN 2 
        WHEN 'changes_requested' THEN 3 
        WHEN 'approved' THEN 4 
      END,
      rc.deadline ASC
  `, [divisionFilter]);
  
  res.json(reviews.map(row => ({
    id: row.id as number,
    cycleId: row.cycle_id as number,
    cycleName: row.cycle_name as string,
    fiscalYear: row.fiscal_year as string,
    vpStem: row.vp_stem as string,
    vpTitle: row.vp_title as string | null,
    status: row.status as VpReviewStatus,
    allocatedBudget: row.allocated_budget as number | null,
    proposedTotal: row.proposed_total as number | null,
    employeeCount: row.employee_count as number | null,
    deadline: row.deadline as string | null,
    sentAt: row.sent_at as string | null,
    reviewedAt: row.reviewed_at as string | null,
    cycleTotalBudget: row.cycle_total_budget as number | null,
    vpSupplementalOffer: row.vp_supplemental_offer as number | null,
    supplementalOfferNotes: row.supplemental_offer_notes as string | null,
    supplementalOfferedAt: row.supplemental_offered_at as string | null,
  })));
});

// VP approves their review
reviewCyclesRouter.post('/:cycleId/vp-approve', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  const { notes } = req.body;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can approve reviews');
  }
  
  // Check VP has a review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  if (vpStatus.status !== 'in_review' && vpStatus.status !== 'hr_revised') {
    throw new BadRequestError('This review is not currently awaiting your approval');
  }
  
  // Calculate total proposed raises for this VP
  const proposedTotal = dbGet<{ total: number }>(`
    SELECT COALESCE(SUM(ea.proposed_raise), 0) as total
    FROM equity_analysis ea
    JOIN position_mappings pm ON ea.position_mapping_id = pm.id
    WHERE pm.vp_stem = ? AND ea.proposed_raise > 0
  `, [divisionFilter]);
  
  // Update VP status to approved
  dbRun(`
    UPDATE vp_review_status 
    SET status = 'approved', 
        reviewed_at = datetime('now'), 
        reviewed_by_id = ?,
        proposed_total = ?,
        notes = COALESCE(?, notes)
    WHERE cycle_id = ? AND vp_stem = ?
  `, [authReq.user.userId, proposedTotal?.total || 0, notes || null, cycleId, divisionFilter]);
  
  // Check if all VPs have responded
  const pendingCount = dbGet<{ count: number }>(
    "SELECT COUNT(*) as count FROM vp_review_status WHERE cycle_id = ? AND status IN ('in_review', 'pending')",
    [cycleId]
  );
  
  if (pendingCount?.count === 0) {
    // All VPs have responded, move cycle to HR final review
    dbRun(`
      UPDATE equity_review_cycles 
      SET status = 'hr_final_review', updated_at = datetime('now')
      WHERE id = ?
    `, [cycleId]);
  }
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: 'Review approved',
    proposedTotal: proposedTotal?.total || 0
  });
});

// VP requests changes/discussion
reviewCyclesRouter.post('/:cycleId/vp-request-changes', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  const { notes } = req.body;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can request changes');
  }
  
  if (!notes || notes.trim().length === 0) {
    throw new BadRequestError('Please provide notes explaining the requested changes');
  }
  
  // Check VP has a review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  // Update VP status
  dbRun(`
    UPDATE vp_review_status 
    SET status = 'changes_requested', 
        reviewed_at = datetime('now'), 
        reviewed_by_id = ?,
        notes = ?
    WHERE cycle_id = ? AND vp_stem = ?
  `, [authReq.user.userId, notes, cycleId, divisionFilter]);
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: 'Change request submitted. HR will review your feedback.'
  });
});

// VP submits supplemental funding offer
const supplementalOfferSchema = z.object({
  amount: z.number().min(0),
  notes: z.string().optional(),
});

reviewCyclesRouter.post('/:cycleId/vp-supplemental-offer', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can submit supplemental funding offers');
  }
  
  const parsed = supplementalOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError('Invalid supplemental offer data');
  }
  
  const { amount, notes } = parsed.data;
  
  // Check VP has a review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  // Update VP status with supplemental offer
  dbRun(`
    UPDATE vp_review_status 
    SET vp_supplemental_offer = ?,
        supplemental_offer_notes = ?,
        supplemental_offered_at = datetime('now')
    WHERE cycle_id = ? AND vp_stem = ?
  `, [amount, notes || null, cycleId, divisionFilter]);
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: amount > 0 
      ? `Supplemental funding offer of $${amount.toLocaleString()} submitted to HR.`
      : 'Supplemental funding offer removed.',
    amount,
    offeredAt: new Date().toISOString()
  });
});

// VP withdraws supplemental funding offer
reviewCyclesRouter.delete('/:cycleId/vp-supplemental-offer', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can modify supplemental funding offers');
  }
  
  // Check VP has a review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  // Clear the supplemental offer
  dbRun(`
    UPDATE vp_review_status 
    SET vp_supplemental_offer = NULL,
        supplemental_offer_notes = NULL,
        supplemental_offered_at = NULL
    WHERE cycle_id = ? AND vp_stem = ?
  `, [cycleId, divisionFilter]);
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: 'Supplemental funding offer withdrawn.'
  });
});

// ============================================
// VP Budget Allocation (during review)
// ============================================

// VP auto-allocates their budget to their division's employees
const vpAutoAllocateSchema = z.object({
  totalBudget: z.number().positive(),
});

reviewCyclesRouter.post('/:cycleId/vp-auto-allocate', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can auto-allocate budget');
  }
  
  const parsed = vpAutoAllocateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError('Invalid budget amount');
  }
  
  const { totalBudget } = parsed.data;
  
  // Check VP has an active review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  if (vpStatus.status !== 'in_review' && vpStatus.status !== 'hr_revised') {
    throw new BadRequestError('You can only allocate budget during an active review');
  }
  
  // Get positions with positive gaps for this VP's division
  const positions = dbAll<{
    position_mapping_id: number;
    equity_gap: number;
  }>(`
    SELECT ea.position_mapping_id, ea.equity_gap
    FROM equity_analysis ea
    JOIN position_mappings pm ON ea.position_mapping_id = pm.id
    WHERE ea.equity_gap > 0 AND pm.vp_stem = ?
  `, [divisionFilter]);
  
  if (positions.length === 0) {
    res.json({
      success: true,
      message: 'No positions with equity gaps found',
      totalBudget,
      allocated: 0,
      positionsUpdated: 0,
    });
    return;
  }
  
  const totalGap = positions.reduce((sum, p) => sum + p.equity_gap, 0);
  let allocated = 0;
  let positionsUpdated = 0;
  
  for (const position of positions) {
    // Allocate proportionally, but cap at the actual gap
    const proportion = position.equity_gap / totalGap;
    const allocation = Math.min(position.equity_gap, totalBudget * proportion);
    const roundedAllocation = Math.round(allocation * 100) / 100;
    
    dbRun(`
      UPDATE equity_analysis 
      SET proposed_raise = ?
      WHERE position_mapping_id = ?
    `, [roundedAllocation, position.position_mapping_id]);
    
    allocated += roundedAllocation;
    positionsUpdated++;
  }
  
  saveDatabase();
  
  res.json({
    success: true,
    message: `Allocated ${allocated.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} to ${positionsUpdated} employees`,
    totalBudget,
    allocated: Math.round(allocated * 100) / 100,
    positionsUpdated,
  });
});

// VP clears all proposed raises for their division
reviewCyclesRouter.post('/:cycleId/vp-clear-raises', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  if (!divisionFilter) {
    throw new ForbiddenError('Only VP reviewers can clear raises');
  }
  
  // Check VP has an active review for this cycle
  const vpStatus = dbGet<{ id: number; status: string }>(
    'SELECT id, status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, divisionFilter]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('No review found for your division in this cycle');
  }
  
  if (vpStatus.status !== 'in_review' && vpStatus.status !== 'hr_revised') {
    throw new BadRequestError('You can only modify raises during an active review');
  }
  
  const result = dbRun(`
    UPDATE equity_analysis 
    SET proposed_raise = 0
    WHERE position_mapping_id IN (
      SELECT id FROM position_mappings WHERE vp_stem = ?
    )
  `, [divisionFilter]);
  
  saveDatabase();
  
  res.json({
    success: true,
    message: `Cleared raises for ${result.changes} positions`,
    cleared: result.changes,
  });
});

// ============================================
// Employee Feedback (VP notes on individual employees)
// ============================================

// Get feedback for employees in a cycle (VP-scoped)
reviewCyclesRouter.get('/:cycleId/employee-feedback', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  let whereClause = 'ef.cycle_id = ?';
  const params: unknown[] = [cycleId];
  
  if (divisionFilter) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(divisionFilter);
  }
  
  const feedback = dbAll<Record<string, unknown>>(`
    SELECT 
      ef.*,
      u.name as created_by_name,
      pm.employee_id,
      pm.employee_name,
      pm.institutional_title,
      pm.department,
      pm.current_salary,
      ea.equity_gap,
      ea.proposed_raise
    FROM employee_feedback ef
    JOIN position_mappings pm ON ef.position_mapping_id = pm.id
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    LEFT JOIN users u ON ef.created_by_id = u.id
    WHERE ${whereClause}
    ORDER BY pm.employee_name
  `, params);
  
  res.json(feedback.map(row => ({
    id: row.id as number,
    cycleId: row.cycle_id as number,
    positionMappingId: row.position_mapping_id as number,
    feedbackType: row.feedback_type as EmployeeFeedbackType,
    adjustedRaise: row.adjusted_raise as number | null,
    notes: row.notes as string | null,
    createdById: row.created_by_id as number,
    createdByName: row.created_by_name as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    employeeId: row.employee_id as string,
    employeeName: row.employee_name as string,
    institutionalTitle: row.institutional_title as string,
    department: row.department as string,
    currentSalary: row.current_salary as number | null,
    equityGap: row.equity_gap as number | null,
    proposedRaise: row.proposed_raise as number | null,
  })));
});

// Add/update feedback for an employee
const feedbackSchema = z.object({
  positionMappingId: z.number().int().positive(),
  feedbackType: z.enum(['approve', 'increase', 'decrease', 'defer', 'discuss']),
  adjustedRaise: z.number().min(0).optional(),
  notes: z.string().optional(),
});

reviewCyclesRouter.post('/:cycleId/employee-feedback', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId } = req.params;
  const { positionMappingId, feedbackType, adjustedRaise, notes } = feedbackSchema.parse(req.body);
  
  const divisionFilter = getDivisionFilter(authReq.user);
  
  // Verify the position belongs to the VP's division (if VP)
  if (divisionFilter) {
    const position = dbGet<{ vp_stem: string }>(
      'SELECT vp_stem FROM position_mappings WHERE id = ?',
      [positionMappingId]
    );
    
    if (!position || position.vp_stem !== divisionFilter) {
      throw new ForbiddenError('You can only provide feedback for employees in your division');
    }
  }
  
  // Upsert feedback
  const existing = dbGet<{ id: number }>(
    'SELECT id FROM employee_feedback WHERE cycle_id = ? AND position_mapping_id = ?',
    [cycleId, positionMappingId]
  );
  
  if (existing) {
    dbRun(`
      UPDATE employee_feedback 
      SET feedback_type = ?, adjusted_raise = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [feedbackType, adjustedRaise || null, notes || null, existing.id]);
  } else {
    dbRun(`
      INSERT INTO employee_feedback (cycle_id, position_mapping_id, feedback_type, adjusted_raise, notes, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [cycleId, positionMappingId, feedbackType, adjustedRaise || null, notes || null, authReq.user.userId]);
  }
  
  // If adjustedRaise is provided and feedback is increase/decrease, update the proposed raise
  if (adjustedRaise !== undefined && (feedbackType === 'increase' || feedbackType === 'decrease' || feedbackType === 'approve')) {
    dbRun('UPDATE equity_analysis SET proposed_raise = ? WHERE position_mapping_id = ?', [adjustedRaise, positionMappingId]);
  }
  
  saveDatabase();
  
  res.json({ success: true, message: 'Feedback saved' });
});

// Delete feedback for an employee
reviewCyclesRouter.delete('/:cycleId/employee-feedback/:positionMappingId', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { cycleId, positionMappingId } = req.params;
  
  const divisionFilter = getDivisionFilter(authReq.user);
  
  // Verify ownership if VP
  if (divisionFilter) {
    const feedback = dbGet<{ vp_stem: string }>(`
      SELECT pm.vp_stem 
      FROM employee_feedback ef
      JOIN position_mappings pm ON ef.position_mapping_id = pm.id
      WHERE ef.cycle_id = ? AND ef.position_mapping_id = ?
    `, [cycleId, positionMappingId]);
    
    if (!feedback || feedback.vp_stem !== divisionFilter) {
      throw new ForbiddenError('You can only delete feedback for employees in your division');
    }
  }
  
  dbRun('DELETE FROM employee_feedback WHERE cycle_id = ? AND position_mapping_id = ?', [cycleId, positionMappingId]);
  
  res.json({ success: true, message: 'Feedback deleted' });
});

// ============================================
// HR actions on VP reviews
// ============================================

// HR marks VP review as revised (after addressing change requests)
reviewCyclesRouter.post('/:cycleId/mark-revised/:vpStem', requireEditor, (req: Request, res: Response) => {
  const { cycleId, vpStem } = req.params;
  const { notes } = req.body;
  
  dbRun(`
    UPDATE vp_review_status 
    SET status = 'hr_revised', notes = COALESCE(?, notes)
    WHERE cycle_id = ? AND vp_stem = ?
  `, [notes || null, cycleId, vpStem]);
  
  res.json({ success: true, message: 'Review marked as revised' });
});

// HR approves a specific VP's review (finalizes their allocations)
reviewCyclesRouter.post('/:cycleId/hr-approve-vp/:vpStem', requireEditor, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const cycleId = parseInt(req.params.cycleId);
  const vpStem = req.params.vpStem;
  const notes = req.body?.notes ?? null;
  
  console.log('HR Approve VP:', { cycleId, vpStem, notes, userId: authReq.user?.userId });
  
  if (isNaN(cycleId)) {
    throw new BadRequestError('Invalid cycle ID');
  }
  
  if (!vpStem) {
    throw new BadRequestError('VP stem is required');
  }
  
  if (!authReq.user?.userId) {
    throw new BadRequestError('User ID not found');
  }
  
  // Check the VP review exists and is in a state that can be approved
  const vpStatus = dbGet<{ status: string }>(
    'SELECT status FROM vp_review_status WHERE cycle_id = ? AND vp_stem = ?',
    [cycleId, vpStem]
  );
  
  if (!vpStatus) {
    throw new NotFoundError('VP review status not found');
  }
  
  // VP must have approved their review first (or HR is overriding after revision)
  if (!['approved', 'hr_revised', 'in_review'].includes(vpStatus.status)) {
    throw new BadRequestError(`Cannot approve VP review in '${vpStatus.status}' status`);
  }
  
  const userId = authReq.user.userId;
  const notesValue = notes || null;
  
  dbRun(`
    UPDATE vp_review_status 
    SET status = 'finalized',
        hr_approved_at = datetime('now'),
        hr_approved_by_id = ?,
        notes = COALESCE(?, notes)
    WHERE cycle_id = ? AND vp_stem = ?
  `, [userId, notesValue, cycleId, vpStem]);
  
  res.json({ success: true, message: 'VP review approved and finalized' });
});

// Finalize cycle (HR moves to final review)
reviewCyclesRouter.post('/:id/finalize', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  // Check all VPs have been finalized, approved, or HR has resolved change requests
  const unresolved = dbGet<{ count: number }>(
    "SELECT COUNT(*) as count FROM vp_review_status WHERE cycle_id = ? AND status NOT IN ('approved', 'hr_revised', 'finalized')",
    [id]
  );
  
  if (unresolved && unresolved.count > 0) {
    throw new BadRequestError(`${unresolved.count} VP review(s) are still pending`);
  }
  
  // If already in hr_final_review, move to approved (skip PC)
  // Otherwise move to hr_final_review so HR can optionally submit to PC
  const newStatus = cycle.status === 'hr_final_review' ? 'approved' : 'hr_final_review';
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [newStatus, id]);
  
  const message = newStatus === 'approved' 
    ? 'Review cycle approved' 
    : 'Review cycle moved to HR final review';
  res.json({ success: true, message });
});

// Mark cycle as implemented
reviewCyclesRouter.post('/:id/mark-implemented', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = 'implemented', notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `, [notes || null, id]);
  
  res.json({ success: true, message: 'Review cycle marked as implemented' });
});

// Archive cycle
reviewCyclesRouter.post('/:id/archive', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ?
  `, [id]);
  
  res.json({ success: true, message: 'Review cycle archived' });
});

// Delete a review cycle (admin only)
reviewCyclesRouter.delete('/:id', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  
  const cycle = dbGet<{ id: number; status: string }>('SELECT id, status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  // Delete related data first (foreign key constraints)
  dbRun('DELETE FROM vp_review_status WHERE cycle_id = ?', [id]);
  dbRun('DELETE FROM employee_feedback WHERE cycle_id = ?', [id]);
  
  // Delete the cycle itself
  dbRun('DELETE FROM equity_review_cycles WHERE id = ?', [id]);
  
  res.json({ success: true, message: 'Review cycle deleted' });
});

// ============================================
// PC (President's Cabinet) Approval Workflow
// ============================================

// Generate & download PC report as PDF
reviewCyclesRouter.get('/:id/pc-report', requireEditor, async (req: Request, res: Response) => {
  const { id } = req.params;

  const cycle = dbGet<{ id: number; name: string; fiscal_year: string }>(
    'SELECT id, name, fiscal_year FROM equity_review_cycles WHERE id = ?', [id],
  );
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }

  try {
    const pdfBuffer = await generatePcReport(cycle.id);

    const safeName = cycle.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Equity_Plan_${safeName}_FY${cycle.fiscal_year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err: any) {
    console.error('PC report generation failed:', err);
    res.status(500).json({ error: 'Report generation failed', details: err.message });
  }
});

// Submit equity plan to President's Cabinet for vote
reviewCyclesRouter.post('/:id/submit-to-pc', requireEditor, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { notes } = req.body;
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  // Check cycle is in a valid state for PC submission
  if (!['hr_final_review', 'vp_review_in_progress', 'pc_rejected'].includes(cycle.status)) {
    throw new BadRequestError(`Cannot submit to PC from '${cycle.status}' status`);
  }
  
  // Check all VPs have been finalized
  const unfinalized = dbGet<{ count: number }>(
    "SELECT COUNT(*) as count FROM vp_review_status WHERE cycle_id = ? AND status != 'finalized'",
    [id]
  );
  
  if (unfinalized && unfinalized.count > 0) {
    throw new BadRequestError(`${unfinalized.count} VP review(s) must be finalized before submitting to PC`);
  }
  
  // Calculate totals for the summary
  const totals = dbGet<{ total_proposed: number; employee_count: number }>(
    `SELECT 
      COALESCE(SUM(proposed_total), 0) as total_proposed,
      COALESCE(SUM(employee_count), 0) as employee_count
    FROM vp_review_status 
    WHERE cycle_id = ?`,
    [id]
  );
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = 'pending_pc_approval',
        pc_submitted_at = datetime('now'),
        pc_submitted_by_id = ?,
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
    WHERE id = ?
  `, [authReq.user.userId, notes || null, id]);
  
  res.json({ 
    success: true, 
    message: 'Equity plan submitted to President\'s Cabinet for approval',
    totalProposed: totals?.total_proposed || 0,
    employeeCount: totals?.employee_count || 0,
  });
});

// Record PC vote on the equity plan
const pcVoteSchema = z.object({
  result: z.enum(['approved', 'rejected']),
  voteDate: z.string().optional(),
  notes: z.string().optional(),
});

reviewCyclesRouter.post('/:id/record-pc-vote', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const { result, voteDate, notes } = pcVoteSchema.parse(req.body);
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  if (cycle.status !== 'pending_pc_approval') {
    throw new BadRequestError(`Cannot record PC vote for cycle in '${cycle.status}' status`);
  }
  
  const newStatus = result === 'approved' ? 'pc_approved' : 'pc_rejected';
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = ?,
        pc_vote_date = COALESCE(?, datetime('now')),
        pc_vote_result = ?,
        pc_vote_notes = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `, [newStatus, voteDate || null, result, notes || null, id]);
  
  res.json({ 
    success: true, 
    message: result === 'approved' 
      ? 'PC has approved the equity plan' 
      : 'PC has rejected the equity plan - revision needed',
    status: newStatus,
  });
});

// Move from PC approved to final approved status (ready for implementation)
reviewCyclesRouter.post('/:id/ratify', requireEditor, (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  const cycle = dbGet<{ status: string }>('SELECT status FROM equity_review_cycles WHERE id = ?', [id]);
  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }
  
  if (cycle.status !== 'pc_approved') {
    throw new BadRequestError(`Cannot ratify cycle in '${cycle.status}' status - must be PC approved first`);
  }
  
  dbRun(`
    UPDATE equity_review_cycles 
    SET status = 'approved',
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
    WHERE id = ?
  `, [notes || null, id]);
  
  res.json({ success: true, message: 'Equity plan ratified and ready for implementation' });
});
