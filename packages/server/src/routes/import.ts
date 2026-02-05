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
