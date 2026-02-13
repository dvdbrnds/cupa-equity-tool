import * as XLSX from 'xlsx';
import { dbGet, dbRun, dbAll, saveDatabase } from '../db/init.js';
import type { ImportResult, ImportValidationError } from '@cupa/shared';

/**
 * Snapshot current salary data to salary_history before making changes.
 * This preserves historical data for year-over-year comparisons.
 */
function snapshotSalaryHistory(dataYear?: string): number {
  const year = dataYear || new Date().getFullYear().toString();
  
  // Get all current positions with salary and equity data
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
    // Check if we already have a snapshot for this employee and year
    const existing = dbGet<{ id: number; current_salary: number }>(
      'SELECT id, current_salary FROM salary_history WHERE employee_id = ? AND data_year = ?',
      [record.employee_id, year]
    );
    
    // Get the previous year's salary to calculate actual raise given
    const previousYear = (parseInt(year) - 1).toString();
    const previousRecord = dbGet<{ current_salary: number }>(
      'SELECT current_salary FROM salary_history WHERE employee_id = ? AND data_year = ?',
      [record.employee_id, previousYear]
    );
    
    const actualRaiseGiven = previousRecord && record.current_salary
      ? record.current_salary - previousRecord.current_salary
      : null;
    
    if (existing) {
      // Update existing snapshot if salary changed
      if (existing.current_salary !== record.current_salary) {
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
        snapshotCount++;
      }
    } else {
      // Insert new snapshot
      dbRun(`
        INSERT INTO salary_history 
        (employee_id, employee_name, vp_stem, department, institutional_title, 
         current_salary, equity_gap, proposed_raise, actual_raise_given, data_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.employee_id, record.employee_name, record.vp_stem, record.department,
        record.institutional_title, record.current_salary, record.equity_gap,
        record.proposed_raise, actualRaiseGiven, year
      ]);
      snapshotCount++;
    }
  }
  
  return snapshotCount;
}

const COLUMN_MAPPINGS = {
  // Master sheet uses "Position Number", VP tabs use "CUPA #"
  cupaCode: ['CUPA #', 'CUPA#', 'CUPA Code', 'CUPACode', 'CUPA_Code', 'CUPA Number', 'Position Number'],
  // Master sheet uses "Title/Role", VP tabs use "CUPA Title"
  cupaTitle: ['CUPA Title', 'CUPATitle', 'CUPA_Title', 'Title', 'Title/Role'],
  cupaDescription: ['CUPA Position Description', 'CUPA Description', 'Description', 'Position Description'],
  blsSocCode: ['BLS SOC #', 'BLS SOC', 'SOC Code', 'SOC #', 'BLS_SOC'],
  blsSocName: ['BLS SOC Category Name', 'SOC Category', 'SOC Name', 'BLS Category', 'BLS Standard Occupational Code (SOC) Category Name'],
  employeeId: ['Employee ID', 'EmployeeID', 'Employee_ID', 'EE ID', 'EEID', 'ID', 'Emp ID', 'EE_ID'],
  institutionalTitle: ['Moravian Job Title', 'Job Title', 'Title', 'Position Title', 'Institutional Title'],
  lastName: ['Last Name', 'LastName', 'Last_Name', 'Surname'],
  firstName: ['First Name', 'FirstName', 'First_Name', 'Given Name'],
  division: ['Division', 'Div'],
  department: ['Department', 'Dept'],
  supervisor: ['Supervisor', 'Reports To', 'Manager'],
  vpStem: ['VP Stem', 'VPStem', 'VP_Stem', 'VP', 'Senior Leader'],
};

function findColumn(headers: string[], possibleNames: string[]): number {
  const headerLower = headers.map(h => (h || '').toString().toLowerCase().trim());
  for (const name of possibleNames) {
    const idx = headerLower.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Fuzzy find an Employee ID column. Handles typos, abbreviations, and
 * spelled-out variations like "EEID", "Employe ID", "Employeee ID", etc.
 * Returns the column index or -1 if not found.
 */
function findEmployeeIdColumn(headers: string[]): number {
  // First try exact match against the known list
  const exact = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.employeeId);
  if (exact !== -1) return exact;

  // Also check the positions column mappings list
  const exactPositions = findColumn(headers, COLUMN_MAPPINGS.employeeId);
  if (exactPositions !== -1) return exactPositions;

  // Fuzzy match: look for headers that look like an employee ID column
  const headerLower = headers.map(h => (h || '').toString().toLowerCase().trim());
  for (let i = 0; i < headerLower.length; i++) {
    const h = headerLower[i];
    if (!h) continue;

    // "eeid" or "ee id" or "ee_id" patterns
    if (/^ee\s*[-_]?\s*id$/i.test(h)) return i;
    // "emp id", "emp_id", "empid"
    if (/^emp\s*[-_]?\s*id$/i.test(h)) return i;
    // "employee id" with typos: emplyee, employe, employeee, emploee, etc.
    // Match: starts with "emp", has some letters, ends with "id" (with optional space/separator)
    if (/^emp\w*[eoy]\w*\s*[-_]?\s*id$/i.test(h)) return i;
    // "employee identification" or "employee ident"
    if (/^emp\w*\s+ident/i.test(h)) return i;
    // Just "id" alone (low priority — only if it's the only 2-char header)
    // Skip this to avoid false positives
  }

  return -1;
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeCupaCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  
  // Skip section headers like "Top Executive Officers: 100000 - 105000"
  if (str.includes(':') || str.includes('-') && str.length > 10) return null;
  
  // If it's already a number, use it directly
  if (typeof value === 'number') {
    const numStr = String(Math.floor(value));
    if (numStr.length >= 5 && numStr.length <= 6) {
      return numStr.padStart(6, '0');
    }
    return null;
  }
  
  // Extract digits from string
  const digits = str.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 6) return null;
  
  // Valid CUPA codes are 5-6 digits
  if (digits.length >= 5) {
    return digits.padStart(6, '0');
  }
  return null;
}

export async function importCupaCatalog(buffer: Buffer, catalogYear: string, sheetName?: string): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const targetSheet = sheetName || workbook.SheetNames[0];
  
  if (!workbook.SheetNames.includes(targetSheet)) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'sheet', message: `Sheet "${targetSheet}" not found` }] };
  }

  const sheet = workbook.Sheets[targetSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  
  if (data.length < 2) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'data', message: 'No data found in sheet' }] };
  }

  const headers = data[0] as string[];
  const colCupaCode = findColumn(headers, COLUMN_MAPPINGS.cupaCode);
  const colTitle = findColumn(headers, COLUMN_MAPPINGS.cupaTitle);
  const colDescription = findColumn(headers, COLUMN_MAPPINGS.cupaDescription);
  const colBlsSoc = findColumn(headers, COLUMN_MAPPINGS.blsSocCode);
  const colBlsName = findColumn(headers, COLUMN_MAPPINGS.blsSocName);

  if (colCupaCode === -1) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 1, field: 'CUPA Code', message: `CUPA Code column not found. Available headers: ${headers.join(', ')}` }] };
  }

  const errors: ImportValidationError[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;

    const cupaCode = normalizeCupaCode(row[colCupaCode]);
    if (!cupaCode) { skipped++; continue; }

    const title = colTitle !== -1 ? normalizeString(row[colTitle]) : '';
    const description = colDescription !== -1 ? normalizeString(row[colDescription]) : '';
    const blsSoc = colBlsSoc !== -1 ? normalizeString(row[colBlsSoc]) : null;
    const blsName = colBlsName !== -1 ? normalizeString(row[colBlsName]) : null;

    if (!title) { errors.push({ row: rowNum, field: 'title', message: 'Missing title' }); skipped++; continue; }

    try {
      const existing = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [cupaCode]);
      if (existing) {
        dbRun('UPDATE cupa_positions SET title = ?, description = ?, bls_soc_code = ?, bls_soc_name = ?, catalog_year = ? WHERE cupa_code = ?',
          [title, description || null, blsSoc, blsName, catalogYear, cupaCode]);
      } else {
        dbRun('INSERT INTO cupa_positions (cupa_code, title, description, bls_soc_code, bls_soc_name, catalog_year) VALUES (?, ?, ?, ?, ?, ?)',
          [cupaCode, title, description || null, blsSoc, blsName, catalogYear]);
      }
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, field: 'database', message: String(err) });
      skipped++;
    }
  }

  saveDatabase();
  return { success: errors.length === 0, imported, skipped, errors: errors.slice(0, 100) };
}

export async function importPositions(buffer: Buffer, userId: number, sheetNames?: string[]): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetsToProcess = sheetNames || workbook.SheetNames;
  
  // Snapshot current salary data before making changes
  const snapshotCount = snapshotSalaryHistory();
  console.log(`Snapshotted ${snapshotCount} salary records to history`);
  
  const errors: ImportValidationError[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  for (const sheetName of sheetsToProcess) {
    if (!workbook.SheetNames.includes(sheetName)) {
      errors.push({ row: 0, field: 'sheet', message: `Sheet "${sheetName}" not found` });
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    
    if (data.length < 2) continue;

    const headers = data[0] as string[];
    const colCupaCode = findColumn(headers, COLUMN_MAPPINGS.cupaCode);
    const colEmployeeId = findEmployeeIdColumn(headers);
    const colTitle = findColumn(headers, COLUMN_MAPPINGS.institutionalTitle);
    const colLastName = findColumn(headers, COLUMN_MAPPINGS.lastName);
    const colFirstName = findColumn(headers, COLUMN_MAPPINGS.firstName);
    const colDivision = findColumn(headers, COLUMN_MAPPINGS.division);
    const colDepartment = findColumn(headers, COLUMN_MAPPINGS.department);
    const colSupervisor = findColumn(headers, COLUMN_MAPPINGS.supervisor);
    const colVpStem = findColumn(headers, COLUMN_MAPPINGS.vpStem);

    if (colEmployeeId === -1 && colTitle === -1) continue;

    const defaultVpStem = sheetName;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      const hasData = row.some(cell => cell !== null && cell !== undefined && cell !== '');
      if (!hasData) continue;

      const employeeId = colEmployeeId !== -1 ? normalizeString(row[colEmployeeId]) : '';
      const title = colTitle !== -1 ? normalizeString(row[colTitle]) : '';
      
      if (!employeeId && !title) { totalSkipped++; continue; }

      const cupaCode = colCupaCode !== -1 ? normalizeCupaCode(row[colCupaCode]) : null;
      const lastName = colLastName !== -1 ? normalizeString(row[colLastName]) : '';
      const firstName = colFirstName !== -1 ? normalizeString(row[colFirstName]) : '';
      const employeeName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      const division = colDivision !== -1 ? normalizeString(row[colDivision]) : sheetName;
      const department = colDepartment !== -1 ? normalizeString(row[colDepartment]) : '';
      const supervisor = colSupervisor !== -1 ? normalizeString(row[colSupervisor]) : null;
      const vpStem = colVpStem !== -1 ? normalizeString(row[colVpStem]) : defaultVpStem;
      const finalEmployeeId = employeeId || `GEN-${sheetName}-${i}`;

      try {
        // Check if exists with same employee_id (using UPSERT pattern)
        const existing = dbGet<{ id: number }>(
          'SELECT id FROM position_mappings WHERE employee_id = ?',
          [finalEmployeeId]
        );

        if (existing) {
          dbRun(`UPDATE position_mappings SET cupa_code = ?, institutional_title = ?, employee_name = ?, division = ?, department = ?, supervisor = ?, vp_stem = ? WHERE id = ?`,
            [cupaCode, title || 'Unknown Title', employeeName, division || 'Unknown', department || 'Unknown', supervisor, vpStem || 'Unknown', existing.id]);
        } else {
          dbRun(`INSERT INTO position_mappings (employee_id, cupa_code, institutional_title, employee_name, division, department, supervisor, vp_stem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [finalEmployeeId, cupaCode, title || 'Unknown Title', employeeName, division || 'Unknown', department || 'Unknown', supervisor, vpStem || 'Unknown']);
        }
        totalImported++;
      } catch (err) {
        errors.push({ row: rowNum, field: 'database', message: `${sheetName}: ${String(err)}` });
        totalSkipped++;
      }
    }
  }

  saveDatabase();
  return {
    success: errors.length === 0,
    imported: totalImported,
    skipped: totalSkipped,
    errors: errors.slice(0, 100),
    warnings: [],
  };
}

// Column mappings for compensation data import
const COMPENSATION_COLUMN_MAPPINGS = {
  employeeId: ['Employee ID', 'EmployeeID', 'Employee_ID', 'EE ID', 'EEID', 'EE_ID', 'Emp ID', 'Worker ID', 'Badge', 'Badge #', 'Personnel #', 'Personnel Number'],
  employeeName: ['Employee Name', 'Employee', 'Name', 'Full Name', 'Worker', 'Worker Name'],
  lastName: ['Last Name', 'LastName', 'Last_Name', 'Surname', 'Last'],
  firstName: ['First Name', 'FirstName', 'First_Name', 'Given Name', 'First'],
  jobTitle: ['Job Title', 'Title', 'Position Title', 'Position', 'Moravian Job Title', 'Institutional Title', 'Position Name'],
  department: ['Department', 'Dept', 'Dept Name', 'Department Name', 'Cost Center', 'Org Unit'],
  division: ['Division', 'Div', 'VP Stem', 'VPStem', 'VP_Stem', 'VP', 'Senior Leader'],
  currentSalary: ['Salary', 'Annual Salary', 'Current Salary', 'Base Salary', 'Annual Pay', 'Base Pay', 'Annualized Salary', 'Total Salary', 'Comp Rate', 'Compensation Rate', 'Annual Rate'],
  hourlyRate: ['Hourly Rate', 'Hourly Pay', 'Hour Rate', 'Rate/Hour', 'Rate Per Hour', 'Pay Rate', 'Hourly'],
  hireDate: ['Hire Date', 'Original Hire Date', 'Start Date', 'Date of Hire', 'Institution Start Date', 'Hire Dt', 'Original Hire'],
  roleStartDate: ['Role Start Date', 'Date in Role', 'Position Start Date', 'Job Start Date', 'Current Position Date', 'Date in Current Position', 'Role Date', 'Job Entry Date'],
  fte: ['FTE', 'Full Time Equivalent', 'Work %', 'Work Percent', 'Percent Time', 'Standard Hours'],
  appointmentMonths: ['Appt Months', 'Appointment', 'Contract Months', 'Months', 'Appointment Months', '10/12'],
  compensationType: ['Comp Type', 'FLSA', 'Salaried/Hourly', 'Pay Type', 'Compensation Type', 'Exempt Status', 'Pay Class', 'Employee Type'],
  hasHousing: ['Housing', 'Housing Benefit', 'Has Housing', 'Receives Housing'],
  housingValue: ['Housing Value', 'Housing Amount', 'Housing Allowance'],
};

function parseDate(value: unknown): string | null {
  if (!value) return null;
  
  // Handle Excel date serial number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  
  // Handle string dates
  const str = String(value).trim();
  if (!str) return null;
  
  // Try parsing common formats
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  if (typeof value === 'number') return value;
  
  const str = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseBoolean(value: unknown): boolean {
  if (!value) return false;
  const str = String(value).toLowerCase().trim();
  return ['yes', 'y', 'true', '1', 'x'].includes(str);
}

function parseCompensationType(value: unknown): 'salaried' | 'hourly' {
  if (!value) return 'salaried';
  const str = String(value).toLowerCase().trim();
  if (['hourly', 'non-exempt', 'nonexempt', 'h'].includes(str)) {
    return 'hourly';
  }
  return 'salaried';
}

/**
 * Normalize a name for fuzzy matching: lowercase, strip extra whitespace, remove suffixes
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '');
}

export async function importCompensationData(buffer: Buffer, sheetName?: string): Promise<ImportResult> {
  // Snapshot current salary data before making changes
  const snapshotCount = snapshotSalaryHistory();
  console.log(`Snapshotted ${snapshotCount} salary records to history before compensation import`);
  
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const targetSheet = sheetName || workbook.SheetNames[0];
  
  if (!workbook.SheetNames.includes(targetSheet)) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'sheet', message: `Sheet "${targetSheet}" not found` }] };
  }

  const sheet = workbook.Sheets[targetSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  
  if (data.length < 2) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'data', message: 'No data found in sheet' }] };
  }

  const headers = data[0] as string[];
  
  // Identify columns (use fuzzy finder for employee ID to handle typos)
  const colEmployeeId = findEmployeeIdColumn(headers);
  const colEmployeeName = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.employeeName);
  const colLastName = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.lastName);
  const colFirstName = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.firstName);
  const colJobTitle = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.jobTitle);
  const colDepartment = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.department);
  const colDivision = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.division);
  const colSalary = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.currentSalary);
  const colHourlyRate = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.hourlyRate);
  const colHireDate = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.hireDate);
  const colRoleStartDate = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.roleStartDate);
  const colFte = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.fte);
  const colAppointmentMonths = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.appointmentMonths);
  const colCompType = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.compensationType);
  const colHasHousing = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.hasHousing);
  const colHousingValue = findColumn(headers, COMPENSATION_COLUMN_MAPPINGS.housingValue);

  // We need at least some way to identify employees
  const hasNameColumn = colEmployeeName !== -1 || (colFirstName !== -1 && colLastName !== -1) || colLastName !== -1;
  const hasIdentifier = colEmployeeId !== -1 || hasNameColumn;
  const hasSalaryData = colSalary !== -1 || colHourlyRate !== -1;

  if (!hasIdentifier) {
    return { 
      success: false, imported: 0, skipped: 0, 
      errors: [{ 
        row: 1, field: 'columns', 
        message: `Could not find an employee identifier column. Need one of: Employee ID, EEID, Employee Name, or First/Last Name. Available headers: ${headers.join(', ')}` 
      }] 
    };
  }

  // Build a name lookup index for fallback matching
  const existingPositions = dbAll<{ id: number; employee_id: string; employee_name: string; institutional_title: string }>(
    'SELECT id, employee_id, employee_name, institutional_title FROM position_mappings'
  );
  const nameIndex = new Map<string, { id: number; employee_id: string; employee_name: string; institutional_title: string }[]>();
  for (const pos of existingPositions) {
    const key = normalizeName(pos.employee_name);
    if (key && key !== 'unknown') {
      if (!nameIndex.has(key)) nameIndex.set(key, []);
      nameIndex.get(key)!.push(pos);
    }
  }

  const errors: ImportValidationError[] = [];
  const warnings: ImportValidationError[] = [];
  let updatedById = 0;
  let updatedByName = 0;
  let created = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;

    // Skip completely empty rows
    const hasData = row.some(cell => cell !== null && cell !== undefined && cell !== '');
    if (!hasData) { skipped++; continue; }

    // Extract identifiers
    const employeeId = colEmployeeId !== -1 ? normalizeString(row[colEmployeeId]) : '';
    let employeeName = '';
    if (colEmployeeName !== -1) {
      employeeName = normalizeString(row[colEmployeeName]);
      // Handle "Last, First" format
      if (employeeName.includes(',')) {
        const parts = employeeName.split(',').map(s => s.trim());
        employeeName = `${parts[1]} ${parts[0]}`.trim();
      }
    } else if (colFirstName !== -1 || colLastName !== -1) {
      const first = colFirstName !== -1 ? normalizeString(row[colFirstName]) : '';
      const last = colLastName !== -1 ? normalizeString(row[colLastName]) : '';
      employeeName = [first, last].filter(Boolean).join(' ');
    }

    if (!employeeId && !employeeName) { skipped++; continue; }

    // Extract compensation fields
    const currentSalary = colSalary !== -1 ? parseNumber(row[colSalary]) : null;
    const hourlyRate = colHourlyRate !== -1 ? parseNumber(row[colHourlyRate]) : null;
    const hireDate = colHireDate !== -1 ? parseDate(row[colHireDate]) : null;
    const roleStartDate = colRoleStartDate !== -1 ? parseDate(row[colRoleStartDate]) : null;
    const fte = colFte !== -1 ? parseNumber(row[colFte]) : 1.0;
    const appointmentMonths = colAppointmentMonths !== -1 ? parseNumber(row[colAppointmentMonths]) : 12;
    const compensationType = colCompType !== -1 ? parseCompensationType(row[colCompType]) : 'salaried';
    const hasHousing = colHasHousing !== -1 ? parseBoolean(row[colHasHousing]) : false;
    const housingValue = colHousingValue !== -1 ? parseNumber(row[colHousingValue]) : 15000;
    const jobTitle = colJobTitle !== -1 ? normalizeString(row[colJobTitle]) : '';
    const department = colDepartment !== -1 ? normalizeString(row[colDepartment]) : '';
    const division = colDivision !== -1 ? normalizeString(row[colDivision]) : '';

    // Skip rows with no salary data only if the file has salary columns
    // (if file has no salary columns at all, e.g. just EEID + Name, we still process every row)
    if (hasSalaryData && currentSalary === null && hourlyRate === null) {
      warnings.push({ row: rowNum, field: 'salary', message: `No salary or hourly rate for ${employeeName || employeeId}, skipped` });
      skipped++;
      continue;
    }

    // Auto-annualize hourly rates
    let effectiveSalary = currentSalary;
    if (compensationType === 'hourly' && hourlyRate && hourlyRate > 0 && !effectiveSalary) {
      const annualHours = 1950;
      effectiveSalary = Math.round(hourlyRate * annualHours * 100) / 100;
      warnings.push({ row: rowNum, field: 'salary', message: `Auto-annualized hourly rate $${hourlyRate}/hr × ${annualHours}hrs = $${effectiveSalary.toLocaleString()}` });
    }

    // --- Matching strategy: Employee ID → Name → Create new ---
    let positionId: number | null = null;
    let matchMethod = '';

    // Strategy 1: Match by Employee ID (exact)
    if (employeeId) {
      const byId = dbGet<{ id: number }>('SELECT id FROM position_mappings WHERE employee_id = ?', [employeeId]);
      if (byId) {
        positionId = byId.id;
        matchMethod = 'id';
      }
    }

    // Strategy 2: Match by employee name (fuzzy)
    if (!positionId && employeeName) {
      const nameKey = normalizeName(employeeName);
      const candidates = nameIndex.get(nameKey);
      if (candidates && candidates.length === 1) {
        positionId = candidates[0].id;
        matchMethod = 'name';
        warnings.push({ row: rowNum, field: 'match', message: `Matched "${employeeName}" by name to existing position (${candidates[0].employee_id})` });
      } else if (candidates && candidates.length > 1) {
        // Multiple name matches — try to disambiguate by title if we have one
        if (jobTitle) {
          const titleLower = jobTitle.toLowerCase();
          const titleMatch = candidates.find(c => c.institutional_title?.toLowerCase() === titleLower);
          if (titleMatch) {
            positionId = titleMatch.id;
            matchMethod = 'name+title';
            warnings.push({ row: rowNum, field: 'match', message: `Matched "${employeeName}" by name+title to existing position (${titleMatch.employee_id})` });
          }
        }
        if (!positionId) {
          warnings.push({ row: rowNum, field: 'match', message: `Multiple employees named "${employeeName}" found — using first match. Consider adding Employee ID column for precision.` });
          positionId = candidates[0].id;
          matchMethod = 'name-ambiguous';
        }
      }
    }

    // Strategy 3: Create a new position_mappings record
    if (!positionId) {
      const newEmployeeId = employeeId || `COMP-${i}`;
      const newName = employeeName || 'Unknown';
      const newTitle = jobTitle || 'Unknown Title';
      const newDept = department || 'Unknown';
      const newDiv = division || 'Unknown';

      try {
        dbRun(`
          INSERT INTO position_mappings (employee_id, institutional_title, employee_name, division, department, supervisor, vp_stem) 
          VALUES (?, ?, ?, ?, ?, NULL, ?)
        `, [newEmployeeId, newTitle, newName, newDiv, newDept, newDiv]);

        const newPos = dbGet<{ id: number }>('SELECT id FROM position_mappings WHERE employee_id = ?', [newEmployeeId]);
        if (newPos) {
          positionId = newPos.id;
          matchMethod = 'created';
          // Also add to the name index for dedup within this import
          const nameKey = normalizeName(newName);
          if (nameKey && nameKey !== 'unknown') {
            if (!nameIndex.has(nameKey)) nameIndex.set(nameKey, []);
            nameIndex.get(nameKey)!.push({ id: newPos.id, employee_id: newEmployeeId, employee_name: newName, institutional_title: jobTitle || 'Unknown Title' });
          }
        }
      } catch (err) {
        errors.push({ row: rowNum, field: 'create', message: `Failed to create position for ${newName}: ${String(err)}` });
        skipped++;
        continue;
      }
    }

    if (!positionId) {
      errors.push({ row: rowNum, field: 'match', message: `Could not match or create position for ${employeeName || employeeId}` });
      skipped++;
      continue;
    }

    // Update the position with available data
    try {
      const updateParts: string[] = [];
      const updateValues: unknown[] = [];

      // Only set compensation fields if the file actually has those columns
      if (hasSalaryData) {
        updateParts.push('current_salary = ?', 'hourly_rate = ?');
        updateValues.push(effectiveSalary, hourlyRate);
      }
      if (colCompType !== -1) {
        updateParts.push('compensation_type = ?');
        updateValues.push(compensationType);
      }
      if (colHireDate !== -1) {
        updateParts.push('hire_date = ?');
        updateValues.push(hireDate);
      }
      if (colRoleStartDate !== -1) {
        updateParts.push('role_start_date = ?');
        updateValues.push(roleStartDate);
      }
      if (colFte !== -1) {
        updateParts.push('fte = ?');
        updateValues.push(fte ?? 1.0);
      }
      if (colAppointmentMonths !== -1) {
        updateParts.push('appointment_months = ?');
        updateValues.push(appointmentMonths ?? 12);
      }
      if (colHasHousing !== -1) {
        updateParts.push('has_housing_benefit = ?');
        updateValues.push(hasHousing ? 1 : 0);
      }
      if (colHousingValue !== -1) {
        updateParts.push('housing_value = ?');
        updateValues.push(housingValue ?? 15000);
      }

      // Update employee name/title/dept if the file provides them
      if (employeeName) { updateParts.push('employee_name = ?'); updateValues.push(employeeName); }
      if (jobTitle) { updateParts.push('institutional_title = ?'); updateValues.push(jobTitle); }
      if (department) { updateParts.push('department = ?'); updateValues.push(department); }
      if (division) { updateParts.push('vp_stem = ?', 'division = ?'); updateValues.push(division, division); }

      if (updateParts.length > 0) {
        updateValues.push(positionId);
        dbRun(`UPDATE position_mappings SET ${updateParts.join(', ')} WHERE id = ?`, updateValues);
      }

      if (matchMethod === 'created') {
        created++;
      } else if (matchMethod === 'id') {
        updatedById++;
      } else {
        updatedByName++;
      }
    } catch (err) {
      errors.push({ row: rowNum, field: 'database', message: String(err) });
      skipped++;
    }
  }

  saveDatabase();

  const totalImported = updatedById + updatedByName + created;
  const summaryParts: string[] = [];
  if (updatedById > 0) summaryParts.push(`${updatedById} matched by ID`);
  if (updatedByName > 0) summaryParts.push(`${updatedByName} matched by name`);
  if (created > 0) summaryParts.push(`${created} new positions created`);
  if (skipped > 0) summaryParts.push(`${skipped} skipped`);
  
  if (summaryParts.length > 0) {
    warnings.unshift({ row: 0, field: 'summary', message: `Import summary: ${summaryParts.join(', ')}` });
  }

  return { success: errors.length === 0, imported: totalImported, skipped, errors: errors.slice(0, 100), warnings: warnings.slice(0, 100) };
}

// Column mappings for CUPA salary data import
const CUPA_SALARY_COLUMN_MAPPINGS = {
  cupaCode: ['CUPA #', 'CUPA Code', 'Position Number', 'Code', 'CUPA', 'Code/Title'],
  medianSalary: ['Median', 'Median Salary', '50th Percentile', 'P50', 'Median Pay'],
  percentile25: ['25th Percentile', 'P25', '25th', 'Q1'],
  percentile75: ['75th Percentile', 'P75', '75th', 'Q3'],
  sampleCount: ['N', 'Count', 'Sample', 'Sample Size', 'Institutions'],
};

/**
 * Detect comparison groups in a multi-group CUPA comparison spreadsheet.
 * Format: Code/Title | Group1 | Group1% | Group2 | Group2% | ...
 * Row 2 typically contains sub-headers like "Median" under each group.
 * Returns array of { name, columnIndex } for each detected group.
 */
export function detectComparisonGroups(buffer: Buffer, sheetName?: string): Array<{ name: string; columnIndex: number }> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const targetSheet = sheetName || workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(targetSheet)) return [];

  const sheet = workbook.Sheets[targetSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (data.length < 2) return [];

  const headers = data[0] as string[];
  const row2 = data[1] as string[];

  // Detect multi-group format: row 2 has repeating "Median" sub-headers
  const medianIndices: number[] = [];
  for (let i = 0; i < row2.length; i++) {
    const val = String(row2[i] || '').toLowerCase().trim();
    if (val === 'median') {
      medianIndices.push(i);
    }
  }

  if (medianIndices.length <= 1) return []; // Not a multi-group format

  // Each "Median" sub-header corresponds to the group named in the header row at that column
  const groups: Array<{ name: string; columnIndex: number }> = [];
  for (const idx of medianIndices) {
    const groupName = String(headers[idx] || '').trim();
    if (groupName) {
      groups.push({ name: groupName, columnIndex: idx });
    }
  }

  return groups;
}

export async function importCupaSalaryData(buffer: Buffer, dataYear: string, sheetName?: string): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const targetSheet = sheetName || workbook.SheetNames[0];
  
  if (!workbook.SheetNames.includes(targetSheet)) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'sheet', message: `Sheet "${targetSheet}" not found` }] };
  }

  const sheet = workbook.Sheets[targetSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  
  if (data.length < 2) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 0, field: 'data', message: 'No data found in sheet' }] };
  }

  const headers = data[0] as string[];
  const colCupaCode = findColumn(headers, CUPA_SALARY_COLUMN_MAPPINGS.cupaCode);

  if (colCupaCode === -1) {
    return { success: false, imported: 0, skipped: 0, errors: [{ row: 1, field: 'CUPA Code', message: `CUPA Code column not found. Available headers: ${headers.join(', ')}` }] };
  }

  // Detect multi-group format
  const groups = detectComparisonGroups(buffer, targetSheet);
  const errors: ImportValidationError[] = [];
  let imported = 0;
  let skipped = 0;

  if (groups.length > 0) {
    // Multi-group comparison format: import ALL groups at once
    const startRow = 2; // Row 2 is the sub-header row ("Median", "Median", ...)

    // Clear existing data for this year (re-import)
    dbRun('DELETE FROM cupa_salary_data WHERE data_year = ?', [dataYear]);

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      let codeValue = row[colCupaCode];
      if (typeof codeValue === 'string' && codeValue.startsWith('[')) {
        const match = codeValue.match(/^\[(\d+)\]/);
        if (match) codeValue = match[1];
      }

      const cupaCode = normalizeCupaCode(codeValue);
      if (!cupaCode) { skipped++; continue; }

      let rowHasData = false;

      // Insert one row per comparison group that has data for this CUPA code
      for (const group of groups) {
        const medianSalary = parseNumber(row[group.columnIndex]);
        if (medianSalary === null || medianSalary <= 0) continue;

        try {
          dbRun(`
            INSERT OR REPLACE INTO cupa_salary_data (cupa_code, data_year, comparison_group, median_salary, percentile_25, percentile_75, sample_count)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL)
          `, [cupaCode, dataYear, group.name, medianSalary]);
          imported++;
          rowHasData = true;
        } catch (err) {
          errors.push({ row: rowNum, field: 'database', message: `${group.name}: ${String(err)}` });
        }
      }

      if (!rowHasData) skipped++;
    }
  } else {
    // Standard single-median format
    const colMedian = findColumn(headers, CUPA_SALARY_COLUMN_MAPPINGS.medianSalary);
    if (colMedian === -1) {
      return { success: false, imported: 0, skipped: 0, errors: [{ row: 1, field: 'Median Salary', message: `Median Salary column not found. Available headers: ${headers.join(', ')}` }] };
    }

    let startRow = 1;
    if (data.length > 1) {
      const row2 = data[1];
      const row2Str = row2.map(c => String(c || '').toLowerCase()).join(' ');
      if (row2Str.includes('median')) startRow = 2;
    }

    const colP25 = findColumn(headers, CUPA_SALARY_COLUMN_MAPPINGS.percentile25);
    const colP75 = findColumn(headers, CUPA_SALARY_COLUMN_MAPPINGS.percentile75);
    const colSampleCount = findColumn(headers, CUPA_SALARY_COLUMN_MAPPINGS.sampleCount);

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      let codeValue = row[colCupaCode];
      if (typeof codeValue === 'string' && codeValue.startsWith('[')) {
        const match = codeValue.match(/^\[(\d+)\]/);
        if (match) codeValue = match[1];
      }

      const cupaCode = normalizeCupaCode(codeValue);
      if (!cupaCode) { skipped++; continue; }

      const medianSalary = parseNumber(row[colMedian]);
      if (medianSalary === null || medianSalary <= 0) { skipped++; continue; }

      const percentile25 = colP25 !== -1 ? parseNumber(row[colP25]) : null;
      const percentile75 = colP75 !== -1 ? parseNumber(row[colP75]) : null;
      const sampleCount = colSampleCount !== -1 ? parseNumber(row[colSampleCount]) : null;

      try {
        const existing = dbGet<{ id: number }>('SELECT id FROM cupa_salary_data WHERE cupa_code = ? AND data_year = ? AND comparison_group = ?', [cupaCode, dataYear, 'default']);
        if (existing) {
          dbRun(`UPDATE cupa_salary_data SET median_salary = ?, percentile_25 = ?, percentile_75 = ?, sample_count = ? WHERE id = ?`,
            [medianSalary, percentile25, percentile75, sampleCount, existing.id]);
        } else {
          dbRun(`INSERT INTO cupa_salary_data (cupa_code, data_year, comparison_group, median_salary, percentile_25, percentile_75, sample_count) VALUES (?, ?, 'default', ?, ?, ?, ?)`,
            [cupaCode, dataYear, medianSalary, percentile25, percentile75, sampleCount]);
        }
        imported++;
      } catch (err) {
        errors.push({ row: rowNum, field: 'database', message: String(err) });
        skipped++;
      }
    }
  }

  saveDatabase();
  return { success: errors.length === 0, imported, skipped, errors: errors.slice(0, 100) };
}

export function getSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames;
}
