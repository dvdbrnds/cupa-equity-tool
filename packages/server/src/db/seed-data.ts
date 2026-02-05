/**
 * Seed script to import initial CUPA data from Excel files
 * Run with: npx tsx src/db/seed-data.ts
 */

import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabaseAsync, dbGet, dbRun, dbAll, saveDatabase, closeDatabase } from './init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to data files in the parent directory
const DATA_PATH = path.join(__dirname, '../../../../..');

async function main() {
  console.log('Initializing database...');
  await initDatabaseAsync();

  // List available Excel files
  const files = fs.readdirSync(DATA_PATH).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
  console.log('\nAvailable Excel files:');
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  // Process CUPA catalog file
  const catalogFile = files.find(f => f.includes('Position Descriptions'));
  if (catalogFile) {
    console.log(`\n--- Processing CUPA Catalog: ${catalogFile} ---`);
    await importCupaCatalog(path.join(DATA_PATH, catalogFile));
  }

  // Process positions from the same file (different sheets)
  if (catalogFile) {
    console.log(`\n--- Processing Positions from: ${catalogFile} ---`);
    await importPositions(path.join(DATA_PATH, catalogFile));
  }

  // Process salary data
  const salaryFile = files.find(f => f.includes('Multi Group Comparison') && f.includes('ALL'));
  if (salaryFile) {
    console.log(`\n--- Processing CUPA Salary Data: ${salaryFile} ---`);
    await importCupaSalaryData(path.join(DATA_PATH, salaryFile));
  }

  // Show summary
  console.log('\n--- Import Summary ---');
  const cupaCodes = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM cupa_positions');
  const positions = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM position_mappings');
  const salaryData = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM cupa_salary_data');
  const vpRoles = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM vp_roles');

  console.log(`CUPA Codes: ${cupaCodes?.count || 0}`);
  console.log(`Positions: ${positions?.count || 0}`);
  console.log(`Salary Data Points: ${salaryData?.count || 0}`);
  console.log(`VP Roles: ${vpRoles?.count || 0}`);

  saveDatabase();
  closeDatabase();
  console.log('\nDone!');
}

function normalizeCupaCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  
  // Skip section headers
  if (str.includes(':') || (str.includes('-') && str.length > 10)) return null;
  
  if (typeof value === 'number') {
    const numStr = String(Math.floor(value));
    if (numStr.length >= 5 && numStr.length <= 6) {
      return numStr.padStart(6, '0');
    }
    return null;
  }
  
  const digits = str.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 6) return null;
  if (digits.length >= 5) {
    return digits.padStart(6, '0');
  }
  return null;
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function importCupaCatalog(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);

  // Find master sheet
  const masterSheet = workbook.SheetNames.find(s => 
    s.toLowerCase().includes('master') || s.toLowerCase().includes('catalog')
  ) || workbook.SheetNames[0];

  console.log(`Using sheet: ${masterSheet}`);
  const sheet = workbook.Sheets[masterSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  if (data.length < 2) {
    console.log('No data found');
    return;
  }

  const headers = (data[0] as string[]).map(h => h?.toString().toLowerCase().trim() || '');
  console.log(`Headers: ${headers.slice(0, 8).join(', ')}...`);

  // Find columns
  const colCode = headers.findIndex(h => h.includes('position number') || h.includes('cupa #') || h.includes('cupa code'));
  const colTitle = headers.findIndex(h => h.includes('title') || h.includes('role'));
  const colDesc = headers.findIndex(h => h.includes('description'));
  const colSoc = headers.findIndex(h => h.includes('soc') && h.includes('#'));
  const colSocName = headers.findIndex(h => h.includes('soc') && h.includes('category'));

  console.log(`Column indices - Code: ${colCode}, Title: ${colTitle}, Desc: ${colDesc}`);

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const cupaCode = normalizeCupaCode(row[colCode]);
    if (!cupaCode) { skipped++; continue; }

    const title = colTitle >= 0 ? normalizeString(row[colTitle]) : '';
    if (!title) { skipped++; continue; }

    const description = colDesc >= 0 ? normalizeString(row[colDesc]) : '';
    const socCode = colSoc >= 0 ? normalizeString(row[colSoc]) : null;
    const socName = colSocName >= 0 ? normalizeString(row[colSocName]) : null;

    const existing = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [cupaCode]);
    if (existing) {
      dbRun('UPDATE cupa_positions SET title = ?, description = ?, bls_soc_code = ?, bls_soc_name = ?, catalog_year = ? WHERE cupa_code = ?',
        [title, description || null, socCode, socName, '2023-24', cupaCode]);
    } else {
      dbRun('INSERT INTO cupa_positions (cupa_code, title, description, bls_soc_code, bls_soc_name, catalog_year) VALUES (?, ?, ?, ?, ?, ?)',
        [cupaCode, title, description || null, socCode, socName, '2023-24']);
    }
    imported++;
  }

  console.log(`Imported: ${imported}, Skipped: ${skipped}`);
}

async function importPositions(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  
  // Skip master sheet, import VP sheets
  const vpSheets = workbook.SheetNames.filter(s => 
    !s.toLowerCase().includes('master') && !s.toLowerCase().includes('catalog')
  );

  console.log(`VP sheets to import: ${vpSheets.join(', ')}`);

  let totalImported = 0;
  let totalSkipped = 0;
  const vpRoles = new Set<string>();

  for (const sheetName of vpSheets) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (data.length < 2) continue;

    const headers = (data[0] as string[]).map(h => h?.toString().toLowerCase().trim() || '');
    
    const colEmpId = headers.findIndex(h => h.includes('employee') && h.includes('id'));
    const colTitle = headers.findIndex(h => h.includes('moravian') || h.includes('job title'));
    const colLastName = headers.findIndex(h => h.includes('last') && h.includes('name'));
    const colFirstName = headers.findIndex(h => h.includes('first') && h.includes('name'));
    const colDivision = headers.findIndex(h => h === 'division');
    const colDept = headers.findIndex(h => h.includes('department'));
    const colSupervisor = headers.findIndex(h => h.includes('supervisor'));
    const colCupa = headers.findIndex(h => h.includes('cupa'));

    const vpStem = sheetName;
    vpRoles.add(vpStem);

    let imported = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const hasData = row.some(cell => cell !== null && cell !== undefined && cell !== '');
      if (!hasData) continue;

      const employeeId = colEmpId >= 0 ? normalizeString(row[colEmpId]) : '';
      const title = colTitle >= 0 ? normalizeString(row[colTitle]) : '';
      if (!employeeId && !title) { totalSkipped++; continue; }

      const lastName = colLastName >= 0 ? normalizeString(row[colLastName]) : '';
      const firstName = colFirstName >= 0 ? normalizeString(row[colFirstName]) : '';
      const employeeName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      const division = colDivision >= 0 ? normalizeString(row[colDivision]) : sheetName;
      const department = colDept >= 0 ? normalizeString(row[colDept]) : '';
      const supervisor = colSupervisor >= 0 ? normalizeString(row[colSupervisor]) : null;
      const cupaCode = colCupa >= 0 ? normalizeCupaCode(row[colCupa]) : null;
      const finalEmpId = employeeId || `GEN-${sheetName}-${i}`;

      const existing = dbGet<{ id: number }>('SELECT id FROM position_mappings WHERE employee_id = ?', [finalEmpId]);
      if (existing) {
        dbRun(`UPDATE position_mappings SET cupa_code = ?, institutional_title = ?, employee_name = ?, division = ?, department = ?, supervisor = ?, vp_stem = ? WHERE id = ?`,
          [cupaCode, title || 'Unknown Title', employeeName, division || 'Unknown', department || 'Unknown', supervisor, vpStem, existing.id]);
      } else {
        dbRun(`INSERT INTO position_mappings (employee_id, cupa_code, institutional_title, employee_name, division, department, supervisor, vp_stem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [finalEmpId, cupaCode, title || 'Unknown Title', employeeName, division || 'Unknown', department || 'Unknown', supervisor, vpStem]);
      }
      imported++;
    }

    console.log(`  ${sheetName}: ${imported} positions`);
    totalImported += imported;
  }

  // Create VP roles
  for (const vpCode of vpRoles) {
    const posCount = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM position_mappings WHERE vp_stem = ?', [vpCode]);
    const existing = dbGet<{ id: number }>('SELECT id FROM vp_roles WHERE code = ?', [vpCode]);
    if (!existing) {
      dbRun('INSERT INTO vp_roles (code, title, position_count) VALUES (?, ?, ?)', [vpCode, vpCode, posCount?.count || 0]);
    } else {
      dbRun('UPDATE vp_roles SET position_count = ? WHERE code = ?', [posCount?.count || 0, vpCode]);
    }
  }

  console.log(`Total positions imported: ${totalImported}`);
}

async function importCupaSalaryData(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);

  const targetSheet = workbook.SheetNames[0];
  console.log(`Using sheet: ${targetSheet}`);
  const sheet = workbook.Sheets[targetSheet];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // This file format has:
  // Row 0: Headers like "Code/Title | Moravian | Budget | % | Student FTE | % | ..."
  // Row 1: Sub-headers "| Median | Median | | Median | ..."
  // Row 2: Empty
  // Row 3+: Data like "[100000] Chief Executive... | 434602 | 360007 | ..."
  
  const headers = (data[0] as string[]).map(h => h?.toString().trim() || '');
  console.log(`Headers: ${headers.slice(0, 12).join(', ')}`);

  // Find the comparison group columns - look for columns with "Median" in row 1
  // We'll use "Budget" as the primary comparison (column 2 based on structure)
  // The code is in column 0 in format "[123456] Title..."
  
  // Find Budget median column (should be index 2 based on the header "Budget")
  let medianColIndex = headers.findIndex(h => h.toLowerCase() === 'budget');
  if (medianColIndex < 0) {
    // Try Student FTE
    medianColIndex = headers.findIndex(h => h.toLowerCase().includes('student'));
  }
  if (medianColIndex < 0) {
    // Fall back to column 2 (after Code/Title and Moravian)
    medianColIndex = 2;
  }

  console.log(`Using median from column ${medianColIndex} (${headers[medianColIndex] || 'unknown'})`);

  let imported = 0;
  let skipped = 0;
  const dataYear = '2023-24';

  // Start from row 3 (skip headers and empty row)
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const codeCell = String(row[0] || '').trim();
    
    // Extract CUPA code from format like "[100000] Chief Executive..."
    const codeMatch = codeCell.match(/\[(\d+)\]/);
    if (!codeMatch) { skipped++; continue; }
    
    const cupaCode = codeMatch[1].padStart(6, '0');
    
    const median = parseNumber(row[medianColIndex]);
    if (!median || median <= 0) { skipped++; continue; }

    const existing = dbGet<{ id: number }>('SELECT id FROM cupa_salary_data WHERE cupa_code = ? AND data_year = ?', [cupaCode, dataYear]);
    if (existing) {
      dbRun('UPDATE cupa_salary_data SET median_salary = ? WHERE id = ?', [median, existing.id]);
    } else {
      dbRun('INSERT INTO cupa_salary_data (cupa_code, data_year, median_salary) VALUES (?, ?, ?)',
        [cupaCode, dataYear, median]);
    }
    imported++;
  }

  console.log(`Salary data imported: ${imported}, Skipped: ${skipped}`);
}

main().catch(console.error);
