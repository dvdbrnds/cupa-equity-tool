import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth, requireEditor, type AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { importCupaCatalog, importPositions, importCompensationData, importCupaSalaryData, detectComparisonGroups } from '../import/excel-processor.js';
import type { ImportResult } from '@cupa/shared';

export const importRouter = Router();
importRouter.use(requireAuth, requireEditor);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestError('Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.'));
  },
});

importRouter.post('/cupa-catalog', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const catalogYear = req.body.catalogYear as string;
  if (!catalogYear) throw new BadRequestError('Catalog year is required');
  const sheetName = req.body.sheetName as string | undefined;
  const result: ImportResult = await importCupaCatalog(req.file.buffer, catalogYear, sheetName);
  res.json(result);
});

importRouter.post('/positions', upload.single('file'), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!req.file) throw new BadRequestError('No file uploaded');
  const sheetNames = req.body.sheetNames ? JSON.parse(req.body.sheetNames) : undefined;
  const result: ImportResult = await importPositions(req.file.buffer, authReq.user.userId, sheetNames);
  res.json(result);
});

importRouter.post('/preview-sheets', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    return { name, rowCount: range.e.r - range.s.r + 1, columnCount: range.e.c - range.s.c + 1 };
  });
  res.json({ sheets });
});

// Import compensation data (salary, hire date, FTE, etc.) - matches by Employee ID
importRouter.post('/compensation', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const sheetName = req.body.sheetName as string | undefined;
  const result: ImportResult = await importCompensationData(req.file.buffer, sheetName);
  res.json(result);
});

// Detect comparison groups in a CUPA salary file (for multi-group comparison sheets)
importRouter.post('/preview-comparison-groups', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const sheetName = req.body.sheetName as string | undefined;
  const groups = detectComparisonGroups(req.file.buffer, sheetName);
  res.json({ groups });
});

// Import CUPA salary data (median salaries by CUPA code)
importRouter.post('/cupa-salary', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const dataYear = req.body.dataYear as string;
  if (!dataYear) throw new BadRequestError('Data year is required (e.g., "2025-26")');
  const sheetName = req.body.sheetName as string | undefined;
  const result: ImportResult = await importCupaSalaryData(req.file.buffer, dataYear, sheetName);
  res.json(result);
});

// Generate fake compensation data for testing
importRouter.post('/generate-fake-compensation', async (_req: Request, res: Response) => {
  const { dbAll, dbRun, dbGet, saveDatabase } = await import('../db/init.js');
  
  // Get all positions with their titles for context
  const positions = dbAll<{ id: number; cupa_code: string | null; institutional_title: string; vp_stem: string }>(`
    SELECT id, cupa_code, institutional_title, vp_stem FROM position_mappings
  `);
  
  let updated = 0;
  let salariedCount = 0;
  let hourlyCount = 0;
  let housingCount = 0;
  
  for (const pos of positions) {
    const titleLower = (pos.institutional_title || '').toLowerCase();
    
    // Determine compensation type based on title keywords
    const hourlyKeywords = ['custod', 'groundskeeper', 'maintenance', 'food service', 
      'dining', 'housekeeper', 'laborer', 'part-time', 'temp', 'seasonal', 'receptionist',
      'cashier', 'clerk', 'aide', 'attendant', 'worker', 'operator'];
    const isHourly = hourlyKeywords.some(k => titleLower.includes(k)) || Math.random() < 0.12;
    
    // Determine if this role has housing (common for certain campus roles)
    const housingKeywords = ['resident', 'campus minister', 'chaplain', 'president'];
    const hasHousing = housingKeywords.some(k => titleLower.includes(k)) || Math.random() < 0.03;
    
    let baseSalary: number;
    
    if (isHourly) {
      // Hourly rate: $14-$28/hr => annualized as hourly * 2080
      const hourlyRate = 14 + Math.random() * 14;
      baseSalary = hourlyRate * 2080;
    } else {
      // Generate realistic salary based on CUPA median if available
      baseSalary = 45000 + Math.random() * 60000; // $45k-$105k default
      
      if (pos.cupa_code) {
        const cupaSalary = dbGet<{ median_salary: number }>(`
          SELECT median_salary FROM cupa_salary_data WHERE cupa_code = ? LIMIT 1
        `, [pos.cupa_code]);
        
        if (cupaSalary && cupaSalary.median_salary > 0) {
          // Create a realistic distribution: some underpaid, some at median, few overpaid
          // Weighted toward underpaid to make equity analysis interesting
          const roll = Math.random();
          let multiplier: number;
          if (roll < 0.35) {
            // 35% underpaid: 70-90% of median
            multiplier = 0.70 + Math.random() * 0.20;
          } else if (roll < 0.65) {
            // 30% slightly under: 90-100%
            multiplier = 0.90 + Math.random() * 0.10;
          } else if (roll < 0.85) {
            // 20% at median: 95-105%
            multiplier = 0.95 + Math.random() * 0.10;
          } else {
            // 15% above: 105-120%
            multiplier = 1.05 + Math.random() * 0.15;
          }
          baseSalary = cupaSalary.median_salary * multiplier;
        }
      }
      
      // Senior roles get a salary floor
      const seniorKeywords = ['vice president', 'vp ', 'dean', 'director', 'chief', 'provost'];
      if (seniorKeywords.some(k => titleLower.includes(k))) {
        baseSalary = Math.max(baseSalary, 75000 + Math.random() * 50000);
      }
    }
    
    const salary = Math.round(baseSalary / 100) * 100; // Round to nearest $100
    
    // Random hire date: weighted toward longer tenures (2015-2025)
    const yearRoll = Math.random();
    let year: number;
    if (yearRoll < 0.15) year = 2015 + Math.floor(Math.random() * 3); // 15% very senior (2015-2017)
    else if (yearRoll < 0.45) year = 2018 + Math.floor(Math.random() * 3); // 30% mid-tenure (2018-2020)
    else if (yearRoll < 0.80) year = 2021 + Math.floor(Math.random() * 3); // 35% recent (2021-2023)
    else year = 2024 + Math.floor(Math.random() * 2); // 20% new (2024-2025)
    
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    const hireDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // FTE: most full-time, ~12% part-time, hourly workers more likely part-time
    let fte: number;
    if (isHourly) {
      fte = Math.random() > 0.60 ? 1.0 : Math.round((0.40 + Math.random() * 0.55) * 100) / 100;
    } else {
      fte = Math.random() > 0.88 ? Math.round((0.50 + Math.random() * 0.45) * 100) / 100 : 1.0;
    }
    
    // Appointment months: mostly 12, faculty-like roles get 10
    const facultyKeywords = ['professor', 'faculty', 'instructor', 'lecturer', 'teaching'];
    const isFacultyLike = facultyKeywords.some(k => titleLower.includes(k));
    const appointmentMonths = isFacultyLike ? (Math.random() > 0.3 ? 10 : 12) : (Math.random() > 0.85 ? 10 : 12);
    
    const compensationType = isHourly ? 'hourly' : 'salaried';
    const housingValue = hasHousing ? (12000 + Math.round(Math.random() * 8000)) : 0;
    
    dbRun(`
      UPDATE position_mappings SET 
        current_salary = ?,
        hire_date = ?,
        fte = ?,
        appointment_months = ?,
        compensation_type = ?,
        has_housing_benefit = ?,
        housing_value = ?
      WHERE id = ?
    `, [salary, hireDate, fte, appointmentMonths, compensationType, hasHousing ? 1 : 0, housingValue, pos.id]);
    
    updated++;
    if (isHourly) hourlyCount++;
    else salariedCount++;
    if (hasHousing) housingCount++;
  }
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: `Generated compensation data for ${updated} positions (${salariedCount} salaried, ${hourlyCount} hourly, ${housingCount} with housing)`,
    stats: { total: updated, salaried: salariedCount, hourly: hourlyCount, housing: housingCount }
  });
});
