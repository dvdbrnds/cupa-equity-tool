import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth, requireEditor, type AuthenticatedRequest } from '../middleware/auth.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { importCupaCatalog, importPositions, importCompensationData, importCupaSalaryData } from '../import/excel-processor.js';
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
  
  // Get all positions
  const positions = dbAll<{ id: number; cupa_code: string | null }>(`
    SELECT id, cupa_code FROM position_mappings
  `);
  
  let updated = 0;
  
  for (const pos of positions) {
    // Generate realistic salary based on CUPA median if available
    let baseSalary = 45000 + Math.random() * 60000; // Random between $45k-$105k
    
    if (pos.cupa_code) {
      const cupaSalary = dbGet<{ median_salary: number }>(`
        SELECT median_salary FROM cupa_salary_data WHERE cupa_code = ? LIMIT 1
      `, [pos.cupa_code]);
      
      if (cupaSalary) {
        // Base salary around 80-110% of CUPA median
        baseSalary = cupaSalary.median_salary * (0.8 + Math.random() * 0.3);
      }
    }
    
    const salary = Math.round(baseSalary / 100) * 100; // Round to nearest $100
    
    // Random hire date between 2018 and 2024
    const year = 2018 + Math.floor(Math.random() * 7);
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    const hireDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Most are full-time, some part-time
    const fte = Math.random() > 0.85 ? (0.5 + Math.random() * 0.4) : 1.0;
    
    // Appointment months - mostly 12, some 10
    const appointmentMonths = Math.random() > 0.2 ? 12 : 10;
    
    dbRun(`
      UPDATE position_mappings SET 
        current_salary = ?,
        hire_date = ?,
        fte = ?,
        appointment_months = ?,
        compensation_type = 'salaried',
        has_housing_benefit = 0
      WHERE id = ?
    `, [salary, hireDate, Math.round(fte * 100) / 100, appointmentMonths, pos.id]);
    
    updated++;
  }
  
  saveDatabase();
  
  res.json({ 
    success: true, 
    message: `Generated fake compensation data for ${updated} positions` 
  });
});
