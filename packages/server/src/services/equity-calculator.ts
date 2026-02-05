import { dbAll, dbGet, dbRun, saveDatabase } from '../db/init.js';

interface PositionForAnalysis {
  id: number;
  employee_id: string;
  employee_name: string;
  institutional_title: string;
  cupa_code: string | null;
  vp_stem: string;
  division: string;
  department: string;
  current_salary: number | null;
  hire_date: string | null;
  fte: number;
  appointment_months: number;
  compensation_type: string;
  has_housing_benefit: number;
  housing_value: number;
}

interface CupaSalary {
  median_salary: number;
  percentile_25: number | null;
  percentile_75: number | null;
}

interface EquityCalculationResult {
  positionId: number;
  baseMedian: number | null;
  adjustedMedian: number | null;
  totalCompensation: number | null;
  equityGap: number | null;
  gapPercentage: number | null;
  yearsInRole: number | null;
  adjustmentNotes: string;
  error?: string;
}

/**
 * Calculate years in role from hire date
 */
function calculateYearsInRole(hireDate: string | null): number | null {
  if (!hireDate) return null;
  
  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) return null;
  
  const now = new Date();
  const diffMs = now.getTime() - hire.getTime();
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  
  return Math.max(0, Math.round(years * 100) / 100); // Round to 2 decimals
}

/**
 * Calculate the adjusted median salary based on:
 * 1. Appointment months (10 vs 12 month)
 * 2. FTE (part-time adjustment)
 * 3. Years of service (2.75% annual, 5-year target)
 * 
 * The YOS adjustment means Year 1 employees should be at ~89.7% of median,
 * so they reach 100% by year 5 with 2.75% annual increases.
 */
function calculateAdjustedMedian(
  baseMedian: number,
  appointmentMonths: number,
  fte: number,
  yearsInRole: number | null,
  annualIncrease: number = 0.0275,
  targetYear: number = 5
): { adjustedMedian: number; notes: string[] } {
  const notes: string[] = [];
  let adjusted = baseMedian;
  
  // 1. Appointment months adjustment (12-month median adjusted to 10-month equivalent)
  if (appointmentMonths < 12) {
    const monthFactor = appointmentMonths / 12;
    adjusted = adjusted * monthFactor;
    notes.push(`${appointmentMonths}-month appointment (×${monthFactor.toFixed(3)})`);
  }
  
  // 2. FTE adjustment
  if (fte < 1.0) {
    adjusted = adjusted * fte;
    notes.push(`${(fte * 100).toFixed(0)}% FTE (×${fte})`);
  }
  
  // 3. Years of service adjustment
  // Formula: If YOS < target_year, employee should be at a lower point
  // so they reach median by target_year with annual increases
  // Factor = (1 + annual_increase) ^ (yearsInRole - targetYear)
  if (yearsInRole !== null && yearsInRole < targetYear) {
    const yosFactor = Math.pow(1 + annualIncrease, yearsInRole - targetYear);
    adjusted = adjusted * yosFactor;
    notes.push(`Year ${yearsInRole.toFixed(1)} of ${targetYear} (×${yosFactor.toFixed(4)})`);
  }
  
  return { adjustedMedian: Math.round(adjusted * 100) / 100, notes };
}

/**
 * Calculate equity for a single position
 */
function calculatePositionEquity(
  position: PositionForAnalysis,
  cupaSalary: CupaSalary | null,
  dataYear: string
): EquityCalculationResult {
  const result: EquityCalculationResult = {
    positionId: position.id,
    baseMedian: null,
    adjustedMedian: null,
    totalCompensation: null,
    equityGap: null,
    gapPercentage: null,
    yearsInRole: null,
    adjustmentNotes: '',
  };
  
  const notes: string[] = [];
  
  // If no CUPA code, can't calculate
  if (!position.cupa_code) {
    result.error = 'No CUPA code assigned';
    result.adjustmentNotes = 'No CUPA code assigned';
    return result;
  }
  
  // If no salary data for this CUPA code
  if (!cupaSalary) {
    result.error = `No salary data for CUPA code ${position.cupa_code} (year: ${dataYear})`;
    result.adjustmentNotes = result.error;
    return result;
  }
  
  // If no current salary
  if (position.current_salary === null) {
    result.error = 'No salary data for employee';
    result.adjustmentNotes = 'Missing employee salary';
    return result;
  }
  
  result.baseMedian = cupaSalary.median_salary;
  
  // Calculate years in role
  result.yearsInRole = calculateYearsInRole(position.hire_date);
  
  // Calculate adjusted median
  const { adjustedMedian, notes: adjustmentNotes } = calculateAdjustedMedian(
    cupaSalary.median_salary,
    position.appointment_months || 12,
    position.fte || 1.0,
    result.yearsInRole
  );
  result.adjustedMedian = adjustedMedian;
  notes.push(...adjustmentNotes);
  
  // Calculate total compensation (salary + housing if applicable)
  result.totalCompensation = position.current_salary;
  if (position.has_housing_benefit) {
    result.totalCompensation += position.housing_value || 15000;
    notes.push(`+$${(position.housing_value || 15000).toLocaleString()} housing`);
  }
  
  // Calculate equity gap (positive = underpaid, negative = overpaid)
  result.equityGap = result.adjustedMedian - result.totalCompensation;
  
  // Calculate gap as percentage of adjusted median
  if (result.adjustedMedian > 0) {
    result.gapPercentage = Math.round((result.equityGap / result.adjustedMedian) * 10000) / 100;
  }
  
  result.adjustmentNotes = notes.length > 0 ? notes.join('; ') : 'No adjustments';
  
  return result;
}

/**
 * Run equity analysis for all positions (no audit cycle)
 */
export function runEquityAnalysis(dataYear: string): {
  success: boolean;
  analyzed: number;
  errors: number;
  message: string;
} {
  // Get all positions
  const positions = dbAll<PositionForAnalysis>(`
    SELECT 
      id, employee_id, employee_name, institutional_title, cupa_code,
      vp_stem, division, department, current_salary, hire_date,
      COALESCE(fte, 1.0) as fte,
      COALESCE(appointment_months, 12) as appointment_months,
      COALESCE(compensation_type, 'salaried') as compensation_type,
      COALESCE(has_housing_benefit, 0) as has_housing_benefit,
      COALESCE(housing_value, 15000) as housing_value
    FROM position_mappings
  `);
  
  if (positions.length === 0) {
    return { success: false, analyzed: 0, errors: 0, message: 'No positions found' };
  }
  
  // Get unique CUPA codes and their salary data
  const cupaCodes = [...new Set(positions.filter(p => p.cupa_code).map(p => p.cupa_code))];
  const salaryDataMap = new Map<string, CupaSalary>();
  
  for (const code of cupaCodes) {
    const salaryData = dbGet<CupaSalary>(`
      SELECT median_salary, percentile_25, percentile_75 
      FROM cupa_salary_data 
      WHERE cupa_code = ? AND data_year = ?
    `, [code, dataYear]);
    
    if (salaryData) {
      salaryDataMap.set(code!, salaryData);
    }
  }
  
  // Clear existing analysis
  dbRun('DELETE FROM equity_analysis');
  
  let analyzed = 0;
  let errors = 0;
  
  for (const position of positions) {
    const cupaSalary = position.cupa_code ? salaryDataMap.get(position.cupa_code) || null : null;
    const result = calculatePositionEquity(position, cupaSalary, dataYear);
    
    try {
      dbRun(`
        INSERT INTO equity_analysis (
          position_mapping_id, base_median, adjusted_median,
          total_compensation, equity_gap, gap_percentage, years_in_role, adjustment_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        result.positionId,
        result.baseMedian,
        result.adjustedMedian,
        result.totalCompensation,
        result.equityGap,
        result.gapPercentage,
        result.yearsInRole,
        result.adjustmentNotes
      ]);
      
      if (result.error) {
        errors++;
      } else {
        analyzed++;
      }
    } catch (err) {
      console.error(`Error saving equity analysis for position ${position.id}:`, err);
      errors++;
    }
  }
  
  saveDatabase();
  
  return {
    success: true,
    analyzed,
    errors,
    message: `Analyzed ${analyzed} positions with ${errors} errors/warnings`
  };
}

/**
 * Get equity summary by VP division
 */
export function getEquitySummaryByVp(vpFilter?: string): Array<{
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
}> {
  let whereClause = '';
  const params: unknown[] = [];
  
  if (vpFilter) {
    whereClause = 'WHERE pm.vp_stem = ?';
    params.push(vpFilter);
  }
  
  return dbAll(`
    SELECT 
      pm.vp_stem as vpStem,
      vr.title as vpTitle,
      COUNT(pm.id) as positionCount,
      SUM(CASE WHEN ea.equity_gap IS NOT NULL THEN 1 ELSE 0 END) as analyzedCount,
      SUM(CASE WHEN ea.equity_gap > 0 THEN 1 ELSE 0 END) as underpaidCount,
      COALESCE(SUM(CASE WHEN ea.equity_gap > 0 THEN ea.equity_gap ELSE 0 END), 0) as totalGap,
      COALESCE(AVG(CASE WHEN ea.equity_gap IS NOT NULL THEN ea.equity_gap END), 0) as averageGap,
      COALESCE(AVG(CASE WHEN ea.gap_percentage IS NOT NULL THEN ea.gap_percentage END), 0) as averageGapPercentage,
      SUM(CASE WHEN pm.compensation_type = 'salaried' THEN 1 ELSE 0 END) as salariedCount,
      SUM(CASE WHEN pm.compensation_type = 'hourly' THEN 1 ELSE 0 END) as hourlyCount,
      COALESCE(SUM(CASE WHEN pm.compensation_type = 'salaried' AND ea.equity_gap > 0 THEN ea.equity_gap ELSE 0 END), 0) as salariedGap,
      COALESCE(SUM(CASE WHEN pm.compensation_type = 'hourly' AND ea.equity_gap > 0 THEN ea.equity_gap ELSE 0 END), 0) as hourlyGap
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    LEFT JOIN vp_roles vr ON pm.vp_stem = vr.code
    ${whereClause}
    GROUP BY pm.vp_stem
    ORDER BY totalGap DESC
  `, params);
}

/**
 * Get overall equity summary
 */
export function getEquitySummary(): {
  totalPositions: number;
  analyzedPositions: number;
  positionsWithGap: number;
  totalGap: number;
  averageGap: number;
  medianGap: number;
  calculatedAt: string | null;
} {
  const stats = dbGet<{
    totalPositions: number;
    analyzedPositions: number;
    positionsWithGap: number;
    totalGap: number;
    averageGap: number;
    calculatedAt: string | null;
  }>(`
    SELECT 
      COUNT(pm.id) as totalPositions,
      SUM(CASE WHEN ea.equity_gap IS NOT NULL THEN 1 ELSE 0 END) as analyzedPositions,
      SUM(CASE WHEN ea.equity_gap > 0 THEN 1 ELSE 0 END) as positionsWithGap,
      COALESCE(SUM(CASE WHEN ea.equity_gap > 0 THEN ea.equity_gap ELSE 0 END), 0) as totalGap,
      COALESCE(AVG(CASE WHEN ea.equity_gap IS NOT NULL THEN ea.equity_gap END), 0) as averageGap,
      MAX(ea.calculated_at) as calculatedAt
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
  `);
  
  // Calculate median gap
  const gaps = dbAll<{ equity_gap: number }>(`
    SELECT ea.equity_gap 
    FROM equity_analysis ea
    WHERE ea.equity_gap IS NOT NULL
    ORDER BY ea.equity_gap
  `);
  
  let medianGap = 0;
  if (gaps.length > 0) {
    const mid = Math.floor(gaps.length / 2);
    medianGap = gaps.length % 2 !== 0 
      ? gaps[mid].equity_gap 
      : (gaps[mid - 1].equity_gap + gaps[mid].equity_gap) / 2;
  }
  
  return {
    totalPositions: stats?.totalPositions || 0,
    analyzedPositions: stats?.analyzedPositions || 0,
    positionsWithGap: stats?.positionsWithGap || 0,
    totalGap: stats?.totalGap || 0,
    averageGap: Math.round((stats?.averageGap || 0) * 100) / 100,
    medianGap: Math.round(medianGap * 100) / 100,
    calculatedAt: stats?.calculatedAt || null,
  };
}

/**
 * Calculate budget allocation proportionally by VP division
 */
export function calculateBudgetAllocation(totalBudget: number): Array<{
  vpStem: string;
  vpTitle: string | null;
  totalGap: number;
  gapPercentage: number;
  allocatedBudget: number;
  positionCount: number;
}> {
  const vpSummary = getEquitySummaryByVp();
  
  // Calculate total gap across all VPs (only positive gaps - underpaid positions)
  const overallTotalGap = vpSummary.reduce((sum, vp) => sum + Math.max(0, vp.totalGap), 0);
  
  if (overallTotalGap === 0) {
    return vpSummary.map(vp => ({
      vpStem: vp.vpStem,
      vpTitle: vp.vpTitle,
      totalGap: vp.totalGap,
      gapPercentage: 0,
      allocatedBudget: 0,
      positionCount: vp.positionCount,
    }));
  }
  
  return vpSummary.map(vp => {
    const vpGap = Math.max(0, vp.totalGap);
    const gapPercentage = (vpGap / overallTotalGap) * 100;
    const allocatedBudget = (vpGap / overallTotalGap) * totalBudget;
    
    return {
      vpStem: vp.vpStem,
      vpTitle: vp.vpTitle,
      totalGap: vp.totalGap,
      gapPercentage: Math.round(gapPercentage * 100) / 100,
      allocatedBudget: Math.round(allocatedBudget * 100) / 100,
      positionCount: vp.positionCount,
    };
  });
}

/**
 * Update proposed raise for a position
 */
export function updateProposedRaise(positionMappingId: number, proposedRaise: number): boolean {
  const result = dbRun(`
    UPDATE equity_analysis 
    SET proposed_raise = ?
    WHERE position_mapping_id = ?
  `, [proposedRaise, positionMappingId]);
  
  return result.changes > 0;
}

/**
 * Get all proposed raises
 */
export function getProposedRaises(): Array<{
  positionMappingId: number;
  employeeName: string;
  vpStem: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number;
  newSalary: number | null;
  remainingGap: number | null;
}> {
  return dbAll(`
    SELECT 
      ea.position_mapping_id as positionMappingId,
      pm.employee_name as employeeName,
      pm.vp_stem as vpStem,
      pm.current_salary as currentSalary,
      ea.equity_gap as equityGap,
      COALESCE(ea.proposed_raise, 0) as proposedRaise,
      CASE WHEN pm.current_salary IS NOT NULL 
        THEN pm.current_salary + COALESCE(ea.proposed_raise, 0) 
        ELSE NULL 
      END as newSalary,
      CASE WHEN ea.equity_gap IS NOT NULL 
        THEN ea.equity_gap - COALESCE(ea.proposed_raise, 0) 
        ELSE NULL 
      END as remainingGap
    FROM equity_analysis ea
    JOIN position_mappings pm ON ea.position_mapping_id = pm.id
    WHERE ea.proposed_raise > 0
    ORDER BY ea.proposed_raise DESC
  `);
}

/**
 * Auto-allocate budget to positions proportionally based on their gaps
 */
export function autoAllocateBudget(totalBudget: number, vpStem?: string): {
  allocated: number;
  positionsUpdated: number;
} {
  // Get positions with positive gaps
  let whereClause = 'ea.equity_gap > 0';
  const params: unknown[] = [];
  
  if (vpStem) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(vpStem);
  }
  
  const positions = dbAll<{
    position_mapping_id: number;
    equity_gap: number;
  }>(`
    SELECT ea.position_mapping_id, ea.equity_gap
    FROM equity_analysis ea
    JOIN position_mappings pm ON ea.position_mapping_id = pm.id
    WHERE ${whereClause}
  `, params);
  
  if (positions.length === 0) {
    return { allocated: 0, positionsUpdated: 0 };
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
  
  return {
    allocated: Math.round(allocated * 100) / 100,
    positionsUpdated,
  };
}

/**
 * Clear all proposed raises
 */
export function clearProposedRaises(vpStem?: string): number {
  if (vpStem) {
    const result = dbRun(`
      UPDATE equity_analysis 
      SET proposed_raise = 0
      WHERE position_mapping_id IN (
        SELECT id FROM position_mappings WHERE vp_stem = ?
      )
    `, [vpStem]);
    return result.changes;
  } else {
    const result = dbRun('UPDATE equity_analysis SET proposed_raise = 0');
    return result.changes;
  }
}

// ============================================
// Salary History Functions
// ============================================

export interface SalaryHistoryRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  vpStem: string;
  department: string;
  institutionalTitle: string;
  currentSalary: number | null;
  equityGap: number | null;
  proposedRaise: number | null;
  actualRaiseGiven: number | null;
  dataYear: string;
  snapshotDate: string;
}

export interface EmployeeHistorySummary {
  employeeId: string;
  employeeName: string;
  vpStem: string;
  department: string;
  institutionalTitle: string;
  years: {
    year: string;
    salary: number | null;
    gap: number | null;
    raiseGiven: number | null;
  }[];
  gapTrend: 'improving' | 'worsening' | 'stable' | 'unknown';
  totalRaisesReceived: number;
  currentGap: number | null;
}

export interface HistorySummaryStats {
  years: string[];
  totalRaisesByYear: { year: string; totalRaises: number; avgRaise: number; employeesHelped: number }[];
  employeesWithClosedGap: number;
  employeesStillNeedingHelp: number;
}

/**
 * Get all available years in salary history
 */
export function getHistoryYears(): string[] {
  const years = dbAll<{ data_year: string }>(`
    SELECT DISTINCT data_year FROM salary_history ORDER BY data_year DESC
  `);
  return years.map(y => y.data_year);
}

/**
 * Get salary history for all employees (optionally filtered by VP)
 */
export function getSalaryHistory(vpFilter?: string): EmployeeHistorySummary[] {
  let whereClause = '';
  const params: unknown[] = [];
  
  if (vpFilter) {
    whereClause = 'WHERE sh.vp_stem = ?';
    params.push(vpFilter);
  }
  
  // Get all history records
  const records = dbAll<{
    employee_id: string;
    employee_name: string;
    vp_stem: string;
    department: string;
    institutional_title: string;
    current_salary: number | null;
    equity_gap: number | null;
    actual_raise_given: number | null;
    data_year: string;
  }>(`
    SELECT 
      sh.employee_id,
      sh.employee_name,
      sh.vp_stem,
      sh.department,
      sh.institutional_title,
      sh.current_salary,
      sh.equity_gap,
      sh.actual_raise_given,
      sh.data_year
    FROM salary_history sh
    ${whereClause}
    ORDER BY sh.employee_id, sh.data_year
  `, params);
  
  // Group by employee
  const employeeMap = new Map<string, EmployeeHistorySummary>();
  
  for (const record of records) {
    if (!employeeMap.has(record.employee_id)) {
      employeeMap.set(record.employee_id, {
        employeeId: record.employee_id,
        employeeName: record.employee_name || 'Unknown',
        vpStem: record.vp_stem || 'Unknown',
        department: record.department || 'Unknown',
        institutionalTitle: record.institutional_title || 'Unknown',
        years: [],
        gapTrend: 'unknown',
        totalRaisesReceived: 0,
        currentGap: null,
      });
    }
    
    const employee = employeeMap.get(record.employee_id)!;
    employee.years.push({
      year: record.data_year,
      salary: record.current_salary,
      gap: record.equity_gap,
      raiseGiven: record.actual_raise_given,
    });
    
    if (record.actual_raise_given && record.actual_raise_given > 0) {
      employee.totalRaisesReceived += record.actual_raise_given;
    }
  }
  
  // Calculate trends and current gap for each employee
  for (const employee of employeeMap.values()) {
    employee.years.sort((a, b) => a.year.localeCompare(b.year));
    
    if (employee.years.length >= 2) {
      const firstGap = employee.years[0].gap;
      const lastGap = employee.years[employee.years.length - 1].gap;
      
      if (firstGap !== null && lastGap !== null) {
        if (lastGap < firstGap - 500) {
          employee.gapTrend = 'improving';
        } else if (lastGap > firstGap + 500) {
          employee.gapTrend = 'worsening';
        } else {
          employee.gapTrend = 'stable';
        }
      }
    }
    
    // Set current gap from most recent year
    const mostRecent = employee.years[employee.years.length - 1];
    if (mostRecent) {
      employee.currentGap = mostRecent.gap;
    }
  }
  
  return Array.from(employeeMap.values());
}

/**
 * Get history for a specific employee
 */
export function getEmployeeHistory(employeeId: string): SalaryHistoryRecord[] {
  return dbAll<SalaryHistoryRecord>(`
    SELECT 
      id,
      employee_id as employeeId,
      employee_name as employeeName,
      vp_stem as vpStem,
      department,
      institutional_title as institutionalTitle,
      current_salary as currentSalary,
      equity_gap as equityGap,
      proposed_raise as proposedRaise,
      actual_raise_given as actualRaiseGiven,
      data_year as dataYear,
      snapshot_date as snapshotDate
    FROM salary_history
    WHERE employee_id = ?
    ORDER BY data_year DESC
  `, [employeeId]);
}

/**
 * Get summary statistics for salary history
 */
export function getHistorySummary(vpFilter?: string): HistorySummaryStats {
  let whereClause = '';
  const params: unknown[] = [];
  
  if (vpFilter) {
    whereClause = 'WHERE sh.vp_stem = ?';
    params.push(vpFilter);
  }
  
  // Get years
  const years = getHistoryYears();
  
  // Get totals by year
  const yearStats = dbAll<{
    data_year: string;
    total_raises: number;
    avg_raise: number;
    employees_helped: number;
  }>(`
    SELECT 
      data_year,
      COALESCE(SUM(CASE WHEN actual_raise_given > 0 THEN actual_raise_given ELSE 0 END), 0) as total_raises,
      COALESCE(AVG(CASE WHEN actual_raise_given > 0 THEN actual_raise_given END), 0) as avg_raise,
      SUM(CASE WHEN actual_raise_given > 0 THEN 1 ELSE 0 END) as employees_helped
    FROM salary_history sh
    ${whereClause}
    GROUP BY data_year
    ORDER BY data_year DESC
  `, params);
  
  // Get gap status counts using current equity analysis
  let gapWhereClause = 'ea.equity_gap IS NOT NULL';
  const gapParams: unknown[] = [];
  
  if (vpFilter) {
    gapWhereClause += ' AND pm.vp_stem = ?';
    gapParams.push(vpFilter);
  }
  
  const gapStats = dbGet<{
    closed_gap: number;
    needs_help: number;
  }>(`
    SELECT 
      SUM(CASE WHEN ea.equity_gap <= 0 THEN 1 ELSE 0 END) as closed_gap,
      SUM(CASE WHEN ea.equity_gap > 0 THEN 1 ELSE 0 END) as needs_help
    FROM equity_analysis ea
    JOIN position_mappings pm ON ea.position_mapping_id = pm.id
    WHERE ${gapWhereClause}
  `, gapParams);
  
  return {
    years,
    totalRaisesByYear: yearStats.map(s => ({
      year: s.data_year,
      totalRaises: s.total_raises,
      avgRaise: Math.round(s.avg_raise * 100) / 100,
      employeesHelped: s.employees_helped,
    })),
    employeesWithClosedGap: gapStats?.closed_gap || 0,
    employeesStillNeedingHelp: gapStats?.needs_help || 0,
  };
}

/**
 * Manually create a snapshot of current salary data for a specific year
 */
export function createSalarySnapshot(dataYear: string): number {
  const currentData = dbAll<{
    employee_id: string;
    employee_name: string;
    vp_stem: string;
    department: string;
    institutional_title: string;
    current_salary: number | null;
    equity_gap: number | null;
    proposed_raise: number | null;
  }>(`
    SELECT 
      pm.employee_id,
      pm.employee_name,
      pm.vp_stem,
      pm.department,
      pm.institutional_title,
      pm.current_salary,
      ea.equity_gap,
      ea.proposed_raise
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    WHERE pm.current_salary IS NOT NULL
  `);
  
  let snapshotCount = 0;
  
  for (const record of currentData) {
    // Get the previous year's salary to calculate actual raise given
    const previousYear = (parseInt(dataYear) - 1).toString();
    const previousRecord = dbGet<{ current_salary: number }>(
      'SELECT current_salary FROM salary_history WHERE employee_id = ? AND data_year = ?',
      [record.employee_id, previousYear]
    );
    
    const actualRaiseGiven = previousRecord && record.current_salary
      ? record.current_salary - previousRecord.current_salary
      : null;
    
    // Upsert the snapshot
    const existing = dbGet<{ id: number }>(
      'SELECT id FROM salary_history WHERE employee_id = ? AND data_year = ?',
      [record.employee_id, dataYear]
    );
    
    if (existing) {
      dbRun(`
        UPDATE salary_history SET 
          employee_name = ?, vp_stem = ?, department = ?, institutional_title = ?,
          current_salary = ?, equity_gap = ?, proposed_raise = ?, 
          actual_raise_given = ?, snapshot_date = datetime('now')
        WHERE id = ?
      `, [
        record.employee_name, record.vp_stem, record.department, record.institutional_title,
        record.current_salary, record.equity_gap, record.proposed_raise,
        actualRaiseGiven, existing.id
      ]);
    } else {
      dbRun(`
        INSERT INTO salary_history 
        (employee_id, employee_name, vp_stem, department, institutional_title, 
         current_salary, equity_gap, proposed_raise, actual_raise_given, data_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.employee_id, record.employee_name, record.vp_stem, record.department,
        record.institutional_title, record.current_salary, record.equity_gap,
        record.proposed_raise, actualRaiseGiven, dataYear
      ]);
    }
    snapshotCount++;
  }
  
  saveDatabase();
  return snapshotCount;
}

/**
 * Submit a review - saves proposed raises to salary_history as the approved review
 * This finalizes the equity analysis for a VP division
 */
export function submitReview(vpStem?: string, reviewNotes?: string): {
  success: boolean;
  employeesUpdated: number;
  totalRaisesApproved: number;
  dataYear: string;
} {
  const dataYear = new Date().getFullYear().toString();
  
  // Build query to get positions with proposed raises
  let whereClause = 'ea.proposed_raise > 0';
  const params: unknown[] = [];
  
  if (vpStem) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(vpStem);
  }
  
  // Get all positions with proposed raises
  const positionsWithRaises = dbAll<{
    employee_id: string;
    employee_name: string;
    vp_stem: string;
    department: string;
    institutional_title: string;
    current_salary: number | null;
    equity_gap: number | null;
    proposed_raise: number;
  }>(`
    SELECT 
      pm.employee_id,
      pm.employee_name,
      pm.vp_stem,
      pm.department,
      pm.institutional_title,
      pm.current_salary,
      ea.equity_gap,
      ea.proposed_raise
    FROM position_mappings pm
    JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    WHERE ${whereClause}
  `, params);
  
  if (positionsWithRaises.length === 0) {
    return {
      success: false,
      employeesUpdated: 0,
      totalRaisesApproved: 0,
      dataYear,
    };
  }
  
  let employeesUpdated = 0;
  let totalRaisesApproved = 0;
  
  for (const record of positionsWithRaises) {
    // Upsert to salary_history with the proposed raise as the approved raise
    const existing = dbGet<{ id: number }>(
      'SELECT id FROM salary_history WHERE employee_id = ? AND data_year = ?',
      [record.employee_id, dataYear]
    );
    
    const notes = reviewNotes || `Review submitted for ${record.vp_stem}`;
    
    if (existing) {
      dbRun(`
        UPDATE salary_history SET 
          employee_name = ?, vp_stem = ?, department = ?, institutional_title = ?,
          current_salary = ?, equity_gap = ?, proposed_raise = ?, 
          actual_raise_given = ?, notes = ?, snapshot_date = datetime('now')
        WHERE id = ?
      `, [
        record.employee_name, record.vp_stem, record.department, record.institutional_title,
        record.current_salary, record.equity_gap, record.proposed_raise,
        record.proposed_raise, // actual_raise_given = proposed_raise when submitting review
        notes, existing.id
      ]);
    } else {
      dbRun(`
        INSERT INTO salary_history 
        (employee_id, employee_name, vp_stem, department, institutional_title, 
         current_salary, equity_gap, proposed_raise, actual_raise_given, data_year, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.employee_id, record.employee_name, record.vp_stem, record.department,
        record.institutional_title, record.current_salary, record.equity_gap,
        record.proposed_raise, record.proposed_raise, dataYear, notes
      ]);
    }
    
    employeesUpdated++;
    totalRaisesApproved += record.proposed_raise;
  }
  
  saveDatabase();
  
  return {
    success: true,
    employeesUpdated,
    totalRaisesApproved: Math.round(totalRaisesApproved * 100) / 100,
    dataYear,
  };
}
