import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import { NotFoundError, BadRequestError } from '../middleware/error-handler.js';
import type { CupaPosition, PaginatedResponse } from '@cupa/shared';

export const cupaCatalogRouter = Router();

cupaCatalogRouter.use(requireAuth);

function rowToCupaPosition(row: Record<string, unknown>): CupaPosition {
  return {
    cupaCode: row.cupa_code as string,
    title: row.title as string,
    description: row.description as string | null as string,
    category: row.category as CupaPosition['category'],
    blsSocCode: row.bls_soc_code as string | null,
    blsSocName: row.bls_soc_name as string | null,
    populationType: row.population_type as CupaPosition['populationType'],
    catalogYear: row.catalog_year as string,
  };
}

cupaCatalogRouter.get('/', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (search) {
    whereClause += ' AND (title LIKE ? OR description LIKE ? OR cupa_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }

  const total = dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM cupa_positions WHERE ${whereClause}`, params);
  const rows = dbAll<Record<string, unknown>>(`
    SELECT cupa_code, title, description, category, bls_soc_code, bls_soc_name, population_type, catalog_year
    FROM cupa_positions WHERE ${whereClause} ORDER BY cupa_code ASC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const response: PaginatedResponse<CupaPosition> = {
    data: rows.map(rowToCupaPosition),
    total: total?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((total?.count || 0) / limit),
  };

  res.json(response);
});

cupaCatalogRouter.get('/search', (req: Request, res: Response) => {
  const query = req.query.q as string;
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));

  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT cupa_code, title, description, category, population_type
    FROM cupa_positions WHERE title LIKE ? OR cupa_code LIKE ?
    ORDER BY CASE WHEN cupa_code = ? THEN 0 WHEN cupa_code LIKE ? THEN 1 ELSE 2 END, title ASC LIMIT ?
  `, [`%${query}%`, `%${query}%`, query, `${query}%`, limit]);

  res.json(rows.map(row => ({
    cupaCode: row.cupa_code,
    title: row.title,
    description: row.description,
    category: row.category,
    populationType: row.population_type,
  })));
});

cupaCatalogRouter.get('/categories/list', (_req: Request, res: Response) => {
  const rows = dbAll<{ category: string; count: number }>(`
    SELECT DISTINCT category, COUNT(*) as count FROM cupa_positions
    WHERE category IS NOT NULL GROUP BY category ORDER BY category
  `);
  res.json(rows);
});

cupaCatalogRouter.get('/years/list', (_req: Request, res: Response) => {
  const rows = dbAll<{ catalog_year: string; count: number }>(`
    SELECT DISTINCT catalog_year, COUNT(*) as count FROM cupa_positions
    GROUP BY catalog_year ORDER BY catalog_year DESC
  `);
  res.json(rows.map(r => ({ year: r.catalog_year, count: r.count })));
});

cupaCatalogRouter.get('/:code', (req: Request, res: Response) => {
  const row = dbGet<Record<string, unknown>>(`
    SELECT cupa_code, title, description, category, bls_soc_code, bls_soc_name, population_type, catalog_year
    FROM cupa_positions WHERE cupa_code = ?
  `, [req.params.code]);

  if (!row) throw new NotFoundError('CUPA position not found');
  res.json(rowToCupaPosition(row));
});

const createCupaSchema = z.object({
  cupaCode: z.string().regex(/^\d{6}$/, 'CUPA code must be a 6-digit number'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  category: z.string().nullable().optional(),
  blsSocCode: z.string().nullable().optional(),
  blsSocName: z.string().nullable().optional(),
  populationType: z.enum(['staff', 'faculty']).default('staff'),
  catalogYear: z.string().min(1, 'Catalog year is required'),
});

cupaCatalogRouter.post('/', requireEditor, (req: Request, res: Response) => {
  const data = createCupaSchema.parse(req.body);
  
  const existing = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [data.cupaCode]);
  if (existing) throw new BadRequestError(`CUPA code ${data.cupaCode} already exists`);

  dbRun(`
    INSERT INTO cupa_positions (cupa_code, title, description, category, bls_soc_code, bls_soc_name, population_type, catalog_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.cupaCode, data.title, data.description || null, data.category || null, data.blsSocCode || null, data.blsSocName || null, data.populationType, data.catalogYear]);

  const newPosition = dbGet<Record<string, unknown>>(`
    SELECT cupa_code, title, description, category, bls_soc_code, bls_soc_name, population_type, catalog_year
    FROM cupa_positions WHERE cupa_code = ?
  `, [data.cupaCode]);

  res.status(201).json(rowToCupaPosition(newPosition!));
});

cupaCatalogRouter.delete('/:code', requireEditor, (req: Request, res: Response) => {
  const cupaCode = req.params.code;

  const mappedCount = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM position_mappings WHERE cupa_code = ?', [cupaCode]);
  if (mappedCount && mappedCount.count > 0) {
    throw new BadRequestError(`Cannot delete: ${mappedCount.count} position(s) are mapped to this CUPA code`);
  }

  const result = dbRun('DELETE FROM cupa_positions WHERE cupa_code = ?', [cupaCode]);
  if (result.changes === 0) throw new NotFoundError('CUPA position not found');

  res.json({ message: 'CUPA position deleted successfully' });
});
