import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet } from '../db/init.js';
import { requireAuth, requireEditor, getDivisionFilter, type AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError, ForbiddenError } from '../middleware/error-handler.js';
import { 
  runEquityAnalysis, 
  getEquitySummary, 
  getEquitySummaryByVp, 
  calculateBudgetAllocation,
  updateProposedRaise,
  getProposedRaises,
  autoAllocateBudget,
  clearProposedRaises,
  getSalaryHistory,
  getEmployeeHistory,
  getHistorySummary,
  getHistoryYears,
  createSalarySnapshot,
  submitReview
} from '../services/equity-calculator.js';
import type { EquityAnalysisWithPosition, CompensationType } from '@cupa/shared';
import * as XLSX from 'xlsx';

export const equityAnalysisRouter = Router();
equityAnalysisRouter.use(requireAuth);

// Get available CUPA salary data years
equityAnalysisRouter.get('/salary-data-years', (_req: Request, res: Response) => {
  const years = dbAll<{ data_year: string; count: number }>(`
    SELECT data_year, COUNT(*) as count 
    FROM cupa_salary_data 
    GROUP BY data_year 
    ORDER BY data_year DESC
  `);
  res.json(years);
});

// Helper to convert DB row to EquityAnalysisWithPosition
function rowToEquityAnalysis(row: Record<string, unknown>): EquityAnalysisWithPosition {
  return {
    id: row.id as number,
    auditCycleId: 0, // No longer used
    positionMappingId: row.position_mapping_id as number,
    baseMedian: row.base_median as number | null,
    adjustedMedian: row.adjusted_median as number | null,
    totalCompensation: row.total_compensation as number | null,
    equityGap: row.equity_gap as number | null,
    gapPercentage: row.gap_percentage as number | null,
    yearsInRole: row.years_in_role as number | null,
    adjustmentNotes: row.adjustment_notes as string | null,
    calculatedAt: row.calculated_at as string,
    proposedRaise: (row.proposed_raise as number) || 0,
    employeeId: row.employee_id as string,
    employeeName: row.employee_name as string,
    institutionalTitle: row.institutional_title as string,
    cupaCode: row.cupa_code as string | null,
    cupaTitle: row.cupa_title as string | null,
    vpStem: row.vp_stem as string,
    division: row.division as string,
    department: row.department as string,
    currentSalary: row.current_salary as number | null,
    hireDate: row.hire_date as string | null,
    roleStartDate: row.role_start_date as string | null,
    hourlyRate: row.hourly_rate as number | null,
    fte: (row.fte as number) || 1.0,
    appointmentMonths: (row.appointment_months as number) || 12,
    compensationType: (row.compensation_type as CompensationType) || 'salaried',
    hasHousingBenefit: Boolean(row.has_housing_benefit),
  };
}

// Run equity analysis calculation
const calculateSchema = z.object({
  dataYear: z.string().min(1),
  // Optional: configurable YOS and hourly parameters
  annualIncrease: z.number().min(0).max(0.20).optional(),  // e.g., 0.0275 = 2.75%
  targetYear: z.number().int().min(1).max(30).optional(),   // e.g., 5
  hourlyAnnualHours: z.number().int().min(1000).max(3000).optional(), // e.g., 1950 (37.5hr/wk)
});

equityAnalysisRouter.post('/calculate', requireEditor, (req: Request, res: Response) => {
  const { dataYear, annualIncrease, targetYear, hourlyAnnualHours } = calculateSchema.parse(req.body);

  // Check if CUPA salary data exists for this year
  const salaryDataCount = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM cupa_salary_data WHERE data_year = ?', [dataYear]);
  if (!salaryDataCount || salaryDataCount.count === 0) {
    throw new BadRequestError(`No CUPA salary data found for year ${dataYear}. Please import CUPA salary data first.`);
  }

  const configOverrides: Record<string, number> = {};
  if (annualIncrease !== undefined) configOverrides.annualIncrease = annualIncrease;
  if (targetYear !== undefined) configOverrides.targetYear = targetYear;
  if (hourlyAnnualHours !== undefined) configOverrides.hourlyAnnualHours = hourlyAnnualHours;

  const result = runEquityAnalysis(dataYear, configOverrides);
  res.json(result);
});

// Get equity analysis summary
equityAnalysisRouter.get('/summary', (req: Request, res: Response) => {
  const summary = getEquitySummary();

  // Add diagnostic counts so we can debug when analyzedPositions is 0
  const diagnostics = dbGet<{
    totalEaRows: number;
    withGap: number;
    withoutGap: number;
    noCupaCode: number;
    noSalary: number;
    totalPositions: number;
    withCupaCode: number;
    withSalary: number;
    cupaSalaryCount: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM equity_analysis) as totalEaRows,
      (SELECT COUNT(*) FROM equity_analysis WHERE equity_gap IS NOT NULL) as withGap,
      (SELECT COUNT(*) FROM equity_analysis WHERE equity_gap IS NULL) as withoutGap,
      (SELECT COUNT(*) FROM position_mappings WHERE cupa_code IS NULL OR cupa_code = '') as noCupaCode,
      (SELECT COUNT(*) FROM position_mappings WHERE current_salary IS NULL OR current_salary = 0) as noSalary,
      (SELECT COUNT(*) FROM position_mappings) as totalPositions,
      (SELECT COUNT(*) FROM position_mappings WHERE cupa_code IS NOT NULL AND cupa_code != '') as withCupaCode,
      (SELECT COUNT(*) FROM position_mappings WHERE current_salary IS NOT NULL AND current_salary > 0) as withSalary,
      (SELECT COUNT(*) FROM cupa_salary_data) as cupaSalaryCount
  `);

  // Include top error reasons from equity_analysis
  const errorSample = dbAll<{ adjustment_notes: string; cnt: number }>(`
    SELECT adjustment_notes, COUNT(*) as cnt 
    FROM equity_analysis 
    WHERE equity_gap IS NULL 
    GROUP BY adjustment_notes 
    ORDER BY cnt DESC 
    LIMIT 5
  `);

  res.json({ ...summary, diagnostics, errorSample });
});

// Get equity summary broken down by VP division
equityAnalysisRouter.get('/by-vp', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  // Filter by division if user is division-scoped
  const divisionFilter = getDivisionFilter(authReq.user);
  let vpSummary = getEquitySummaryByVp(divisionFilter || undefined);

  res.json(vpSummary);
});

// Get all comparison group medians for a specific CUPA code
equityAnalysisRouter.get('/salary-comparisons/:cupaCode', (req: Request, res: Response) => {
  const { cupaCode } = req.params;
  const dataYear = req.query.dataYear as string | undefined;

  let query = 'SELECT comparison_group, median_salary, data_year FROM cupa_salary_data WHERE cupa_code = ?';
  const params: unknown[] = [cupaCode];

  if (dataYear) {
    query += ' AND data_year = ?';
    params.push(dataYear);
  }

  query += ' ORDER BY comparison_group';

  const rows = dbAll<{ comparison_group: string; median_salary: number; data_year: string }>(query, params);
  res.json(rows);
});

// Get all comparison group medians for multiple CUPA codes at once
equityAnalysisRouter.get('/salary-comparisons', (req: Request, res: Response) => {
  const dataYear = req.query.dataYear as string | undefined;
  const cupaCodes = req.query.cupaCodes as string | undefined;

  if (!cupaCodes) {
    res.json([]);
    return;
  }

  const codes = cupaCodes.split(',').map(c => c.trim()).filter(Boolean);
  if (codes.length === 0) {
    res.json([]);
    return;
  }

  const placeholders = codes.map(() => '?').join(',');
  let query = `SELECT cupa_code, comparison_group, median_salary FROM cupa_salary_data WHERE cupa_code IN (${placeholders})`;
  const params: unknown[] = [...codes];

  if (dataYear) {
    query += ' AND data_year = ?';
    params.push(dataYear);
  }

  query += ' ORDER BY cupa_code, comparison_group';

  const rows = dbAll<{ cupa_code: string; comparison_group: string; median_salary: number }>(query, params);
  res.json(rows);
});

// Get detailed equity analysis for positions, optionally filtered by VP
equityAnalysisRouter.get('/positions', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const vpStem = req.query.vpStem as string | undefined;
  const compensationType = req.query.compensationType as string | undefined;
  const gapOnly = req.query.gapOnly === 'true';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params: unknown[] = [];

  // Filter by VP if specified
  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(divisionFilter);
  } else if (vpStem) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(vpStem);
  }

  // Filter by compensation type
  if (compensationType && ['salaried', 'hourly'].includes(compensationType)) {
    whereClause += ' AND pm.compensation_type = ?';
    params.push(compensationType);
  }

  // Filter to only positions with a gap
  if (gapOnly) {
    whereClause += ' AND ea.equity_gap > 0';
  }

  // Get total count
  const countResult = dbGet<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    WHERE ${whereClause}
  `, params);

  const rows = dbAll<Record<string, unknown>>(`
    SELECT 
      ea.id, ea.position_mapping_id, ea.base_median, ea.adjusted_median,
      ea.total_compensation, ea.equity_gap, ea.gap_percentage, ea.years_in_role,
      ea.adjustment_notes, ea.calculated_at, ea.proposed_raise,
      pm.employee_id, pm.employee_name, pm.institutional_title, pm.cupa_code,
      pm.vp_stem, pm.division, pm.department, pm.current_salary,
      pm.hire_date, pm.role_start_date, pm.hourly_rate,
      pm.fte, pm.appointment_months, pm.compensation_type, pm.has_housing_benefit,
      cp.title as cupa_title
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    WHERE ${whereClause}
    ORDER BY ea.equity_gap DESC NULLS LAST
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  res.json({
    data: rows.map(rowToEquityAnalysis),
    total: countResult?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult?.count || 0) / limit),
  });
});

// Calculate budget allocation
const budgetSchema = z.object({
  totalBudget: z.number().positive(),
});

equityAnalysisRouter.post('/allocate-budget', requireEditor, (req: Request, res: Response) => {
  const { totalBudget } = budgetSchema.parse(req.body);

  const allocation = calculateBudgetAllocation(totalBudget);
  
  res.json({
    totalBudget,
    allocation,
    totalAllocated: allocation.reduce((sum, a) => sum + a.allocatedBudget, 0),
  });
});

// Update proposed raise for a position
const proposeRaiseSchema = z.object({
  positionMappingId: z.number().int().positive(),
  proposedRaise: z.number().min(0),
});

equityAnalysisRouter.post('/propose-raise', requireEditor, (req: Request, res: Response) => {
  const { positionMappingId, proposedRaise } = proposeRaiseSchema.parse(req.body);
  
  const success = updateProposedRaise(positionMappingId, proposedRaise);
  
  if (!success) {
    throw new BadRequestError('Position not found in equity analysis');
  }
  
  res.json({ success: true, positionMappingId, proposedRaise });
});

// Get all proposed raises
equityAnalysisRouter.get('/proposed-raises', (req: Request, res: Response) => {
  const raises = getProposedRaises();
  res.json(raises);
});

// Auto-allocate budget to positions
const autoAllocateSchema = z.object({
  totalBudget: z.number().positive(),
  vpStem: z.string().optional(),
});

equityAnalysisRouter.post('/auto-allocate', requireEditor, (req: Request, res: Response) => {
  const { totalBudget, vpStem } = autoAllocateSchema.parse(req.body);
  
  const result = autoAllocateBudget(totalBudget, vpStem);
  
  res.json({
    success: true,
    totalBudget,
    ...result,
  });
});

// Clear all proposed raises
equityAnalysisRouter.post('/clear-raises', requireEditor, (req: Request, res: Response) => {
  const vpStem = req.body.vpStem as string | undefined;
  
  const cleared = clearProposedRaises(vpStem);
  
  res.json({ success: true, cleared });
});

// Export equity analysis to Excel
equityAnalysisRouter.get('/export', requireEditor, (_req: Request, res: Response) => {
  // Get all positions with equity analysis
  const rows = dbAll<Record<string, unknown>>(`
    SELECT 
      pm.employee_id as "Employee ID",
      pm.employee_name as "Employee Name",
      pm.institutional_title as "Job Title",
      pm.cupa_code as "CUPA Code",
      cp.title as "CUPA Title",
      pm.vp_stem as "VP Division",
      pm.division as "Division",
      pm.department as "Department",
      pm.current_salary as "Current Salary",
      pm.hourly_rate as "Hourly Rate",
      pm.fte as "FTE",
      pm.appointment_months as "Appt Months",
      pm.compensation_type as "Comp Type",
      pm.hire_date as "Hire Date",
      pm.role_start_date as "Role Start Date",
      CASE WHEN pm.has_housing_benefit THEN 'Yes' ELSE 'No' END as "Housing Benefit",
      ea.base_median as "CUPA Median",
      ea.adjusted_median as "Adjusted Median",
      ea.total_compensation as "Total Compensation",
      ea.equity_gap as "Equity Gap",
      ea.gap_percentage as "Gap %",
      ea.years_in_role as "Years in Role",
      ea.proposed_raise as "Proposed Raise",
      CASE WHEN pm.current_salary IS NOT NULL AND ea.proposed_raise > 0 
        THEN pm.current_salary + ea.proposed_raise 
        ELSE pm.current_salary 
      END as "New Salary",
      ea.adjustment_notes as "Adjustment Notes"
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    ORDER BY pm.vp_stem, ea.equity_gap DESC NULLS LAST
  `);

  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Positions sheet
  const wsPositions = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsPositions, 'Equity Analysis');

  // Summary by VP sheet
  const vpSummary = getEquitySummaryByVp();
  const wsSummary = XLSX.utils.json_to_sheet(vpSummary.map(vp => ({
    'VP Division': vp.vpStem,
    'VP Title': vp.vpTitle,
    'Position Count': vp.positionCount,
    'Analyzed Count': vp.analyzedCount,
    'Total Gap': vp.totalGap,
    'Average Gap': vp.averageGap,
    'Average Gap %': vp.averageGapPercentage,
    'Salaried Count': vp.salariedCount,
    'Hourly Count': vp.hourlyCount,
    'Salaried Gap': vp.salariedGap,
    'Hourly Gap': vp.hourlyGap,
  })));
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary by VP');

  // Overall summary sheet
  const summary = getEquitySummary();
  const wsOverall = XLSX.utils.json_to_sheet([{
    'Total Positions': summary.totalPositions,
    'Analyzed Positions': summary.analyzedPositions,
    'Positions with Gap': summary.positionsWithGap,
    'Total Gap': summary.totalGap,
    'Average Gap': summary.averageGap,
    'Median Gap': summary.medianGap,
    'Calculated At': summary.calculatedAt,
  }]);
  XLSX.utils.book_append_sheet(wb, wsOverall, 'Overall Summary');

  // Proposed raises sheet
  const proposedRaises = getProposedRaises();
  if (proposedRaises.length > 0) {
    const wsRaises = XLSX.utils.json_to_sheet(proposedRaises.map(r => ({
      'Employee Name': r.employeeName,
      'VP Division': r.vpStem,
      'Current Salary': r.currentSalary,
      'Equity Gap': r.equityGap,
      'Proposed Raise': r.proposedRaise,
      'New Salary': r.newSalary,
      'Remaining Gap': r.remainingGap,
    })));
    XLSX.utils.book_append_sheet(wb, wsRaises, 'Proposed Raises');
  }

  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Send file
  const filename = `Equity_Analysis_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// ============================================
// Salary History Endpoints
// ============================================

// Get available years in salary history
equityAnalysisRouter.get('/history/years', (_req: Request, res: Response) => {
  const years = getHistoryYears();
  res.json(years);
});

// Get salary history summary stats
equityAnalysisRouter.get('/history/summary', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);
  const vpStem = typeof req.query.vpStem === 'string' ? req.query.vpStem : divisionFilter;
  
  const summary = getHistorySummary(vpStem || undefined);
  res.json(summary);
});

// Get salary history for all employees
equityAnalysisRouter.get('/history', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);
  const vpStem = typeof req.query.vpStem === 'string' ? req.query.vpStem : divisionFilter;
  
  const history = getSalaryHistory(vpStem || undefined);
  res.json(history);
});

// Get salary history for a specific employee
equityAnalysisRouter.get('/history/employee/:employeeId', (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const history = getEmployeeHistory(employeeId);
  res.json(history);
});

// Create a manual snapshot for a specific year (HR only)
equityAnalysisRouter.post('/history/snapshot', requireEditor, (req: Request, res: Response) => {
  const { dataYear } = req.body;
  
  if (!dataYear || typeof dataYear !== 'string') {
    throw new BadRequestError('dataYear is required');
  }
  
  const count = createSalarySnapshot(dataYear);
  res.json({ success: true, snapshotCount: count, dataYear });
});

// Submit a review - finalize proposed raises and save to history
// VPs can submit for their own division, editors can submit for any division
equityAnalysisRouter.post('/submit-review', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { vpStem, notes } = req.body;
  
  // Get the user's division filter (null for institution-wide roles, VP code for VPs)
  const divisionFilter = getDivisionFilter(authReq.user);
  
  // Determine the effective VP stem for this submission
  const effectiveVpStem = vpStem || divisionFilter;
  
  // VPs can only submit reviews for their own division
  if (divisionFilter && effectiveVpStem !== divisionFilter) {
    throw new ForbiddenError('You can only submit reviews for your own division');
  }
  
  const result = submitReview(effectiveVpStem || undefined, notes);
  
  if (!result.success) {
    throw new BadRequestError('No proposed raises to submit. Please allocate raises first.');
  }
  
  res.json(result);
});
