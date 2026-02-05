import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, requireEditor, getDivisionFilter, type AuthenticatedRequest } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/error-handler.js';
import type { PositionMapping, PositionMappingWithCupa, PaginatedResponse, AuditStatus } from '@cupa/shared';

export const positionsRouter = Router();
positionsRouter.use(requireAuth);

function rowToPosition(row: Record<string, unknown>): PositionMapping {
  return {
    id: row.id as number,
    employeeId: row.employee_id as string,
    cupaCode: row.cupa_code as string | null,
    institutionalTitle: row.institutional_title as string,
    employeeName: row.employee_name as string,
    division: row.division as string,
    department: row.department as string,
    supervisor: row.supervisor as string | null,
    vpStem: row.vp_stem as string,
    auditStatus: row.audit_status as AuditStatus,
    assignedReviewerId: row.assigned_reviewer_id as number | null,
    reviewDate: row.review_date as string | null,
    createdAt: row.created_at as string,
    currentSalary: row.current_salary as number | null,
    hireDate: row.hire_date as string | null,
    fte: (row.fte as number) || 1.0,
    appointmentMonths: (row.appointment_months as number) || 12,
    compensationType: (row.compensation_type as string) || 'salaried',
    hasHousingBenefit: Boolean(row.has_housing_benefit),
    housingValue: (row.housing_value as number) || 15000,
  };
}

function rowToPositionWithCupa(row: Record<string, unknown>): PositionMappingWithCupa {
  return {
    ...rowToPosition(row),
    cupaTitle: row.cupa_title as string | null,
    cupaDescription: row.cupa_description as string | null,
    reviewerName: row.reviewer_name as string | null,
  };
}

positionsRouter.get('/', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const offset = (page - 1) * limit;
  
  const search = req.query.search as string | undefined;
  const vpStem = req.query.vpStem as string | undefined;
  const auditStatus = req.query.auditStatus as string | undefined;

  const divisionFilter = getDivisionFilter(authReq.user);
  
  let whereClause = '1=1';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(divisionFilter);
  }

  if (search) {
    whereClause += ' AND (pm.employee_name LIKE ? OR pm.institutional_title LIKE ? OR pm.employee_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (vpStem) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(vpStem);
  }

  if (auditStatus) {
    whereClause += ' AND pm.audit_status = ?';
    params.push(auditStatus);
  }

  const total = dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM position_mappings pm WHERE ${whereClause}`, params);
  
  const rows = dbAll<Record<string, unknown>>(`
    SELECT pm.id, pm.employee_id, pm.cupa_code, pm.institutional_title, pm.employee_name, pm.division, pm.department, pm.supervisor,
      pm.vp_stem, pm.audit_status, pm.assigned_reviewer_id, pm.review_date, pm.created_at,
      pm.current_salary, pm.hire_date, pm.fte, pm.appointment_months, pm.compensation_type, pm.has_housing_benefit, pm.housing_value,
      cp.title as cupa_title, cp.description as cupa_description, u.name as reviewer_name
    FROM position_mappings pm
    LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    LEFT JOIN users u ON pm.assigned_reviewer_id = u.id
    WHERE ${whereClause} ORDER BY pm.employee_name ASC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const response: PaginatedResponse<PositionMappingWithCupa> = {
    data: rows.map(rowToPositionWithCupa),
    total: total?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((total?.count || 0) / limit),
  };

  res.json(response);
});

positionsRouter.get('/divisions', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);

  let query = 'SELECT DISTINCT division, COUNT(*) as count FROM position_mappings';
  const params: unknown[] = [];

  if (divisionFilter) {
    query += ' WHERE vp_stem = ?';
    params.push(divisionFilter);
  }
  query += ' GROUP BY division ORDER BY division';

  const rows = dbAll<{ division: string; count: number }>(query, params);
  res.json(rows);
});

positionsRouter.get('/vp-stems', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);

  let query = 'SELECT DISTINCT vp_stem, COUNT(*) as count FROM position_mappings';
  const params: unknown[] = [];

  if (divisionFilter) {
    query += ' WHERE vp_stem = ?';
    params.push(divisionFilter);
  }
  query += ' GROUP BY vp_stem ORDER BY vp_stem';

  const rows = dbAll<{ vp_stem: string; count: number }>(query, params);
  res.json(rows.map(r => ({ vpStem: r.vp_stem, count: r.count })));
});

positionsRouter.get('/:id', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  const row = dbGet<Record<string, unknown>>(`
    SELECT pm.id, pm.employee_id, pm.cupa_code, pm.institutional_title, pm.employee_name, pm.division, pm.department, pm.supervisor,
      pm.vp_stem, pm.audit_status, pm.assigned_reviewer_id, pm.review_date, pm.created_at,
      pm.current_salary, pm.hire_date, pm.fte, pm.appointment_months, pm.compensation_type, pm.has_housing_benefit, pm.housing_value,
      cp.title as cupa_title, cp.description as cupa_description, u.name as reviewer_name
    FROM position_mappings pm
    LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    LEFT JOIN users u ON pm.assigned_reviewer_id = u.id
    WHERE pm.id = ?
  `, [req.params.id]);

  if (!row) throw new NotFoundError('Position not found');

  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter && row.vp_stem !== divisionFilter) {
    throw new ForbiddenError('Access denied to this position');
  }

  res.json(rowToPositionWithCupa(row));
});

const createPositionSchema = z.object({
  employeeId: z.string().min(1),
  cupaCode: z.string().nullable().optional(),
  institutionalTitle: z.string().min(1),
  employeeName: z.string().min(1),
  division: z.string().min(1),
  department: z.string().min(1),
  supervisor: z.string().nullable().optional(),
  vpStem: z.string().min(1),
});

positionsRouter.post('/', requireEditor, (req: Request, res: Response) => {
  const data = createPositionSchema.parse(req.body);
  
  if (data.cupaCode) {
    const cupaExists = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [data.cupaCode]);
    if (!cupaExists) throw new BadRequestError(`Invalid CUPA code: ${data.cupaCode}`);
  }

  const result = dbRun(`
    INSERT INTO position_mappings (employee_id, cupa_code, institutional_title, employee_name, division, department, supervisor, vp_stem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.employeeId, data.cupaCode || null, data.institutionalTitle, data.employeeName, data.division, data.department, data.supervisor || null, data.vpStem]);

  const newPosition = dbGet<Record<string, unknown>>(`
    SELECT pm.id, pm.employee_id, pm.cupa_code, pm.institutional_title, pm.employee_name, pm.division, pm.department, pm.supervisor,
      pm.vp_stem, pm.audit_status, pm.assigned_reviewer_id, pm.review_date, pm.created_at,
      pm.current_salary, pm.hire_date, pm.fte, pm.appointment_months, pm.compensation_type, pm.has_housing_benefit, pm.housing_value,
      cp.title as cupa_title, cp.description as cupa_description
    FROM position_mappings pm LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code WHERE pm.id = ?
  `, [result.lastInsertRowid]);

  res.status(201).json(rowToPositionWithCupa(newPosition!));
});

positionsRouter.get('/:id/history', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);

  const position = dbGet<{ vp_stem: string }>('SELECT vp_stem FROM position_mappings WHERE id = ?', [positionId]);
  if (!position) throw new NotFoundError('Position not found');

  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter && position.vp_stem !== divisionFilter) {
    throw new ForbiddenError('Access denied to this position');
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT mh.id, mh.old_cupa_code, mh.new_cupa_code, mh.old_status, mh.new_status, mh.notes, mh.created_at, u.name as user_name
    FROM mapping_history mh JOIN users u ON mh.user_id = u.id
    WHERE mh.position_mapping_id = ? ORDER BY mh.created_at DESC
  `, [positionId]);

  res.json(rows);
});
