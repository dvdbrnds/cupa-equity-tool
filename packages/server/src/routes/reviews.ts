import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, getDivisionFilter, type AuthenticatedRequest } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/error-handler.js';
import type { PositionMappingWithCupa, ReviewCommentWithUser, PaginatedResponse, AuditStatus } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES } from '@cupa/shared';
import { emailHrPositionFlagged } from '../services/email.js';

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

function rowToPositionWithCupa(row: Record<string, unknown>): PositionMappingWithCupa {
  return {
    id: row.id as number, employeeId: row.employee_id as string, cupaCode: row.cupa_code as string | null,
    institutionalTitle: row.institutional_title as string, employeeName: row.employee_name as string,
    division: row.division as string, department: row.department as string, supervisor: row.supervisor as string | null,
    vpStem: row.vp_stem as string, auditStatus: row.audit_status as AuditStatus,
    assignedReviewerId: row.assigned_reviewer_id as number | null, reviewDate: row.review_date as string | null,
    createdAt: row.created_at as string,
    cupaTitle: row.cupa_title as string | null, cupaDescription: row.cupa_description as string | null,
    reviewerName: row.reviewer_name as string | null,
  };
}

reviewsRouter.get('/my-queue', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const offset = (page - 1) * limit;
  const auditStatus = req.query.auditStatus as string | undefined;

  let whereClause = '1=1';
  const params: unknown[] = [];

  // Use dynamic VP role lookup instead of static user.division
  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter) {
    whereClause += ' AND (pm.assigned_reviewer_id = ? OR pm.vp_stem = ?)';
    params.push(authReq.user.userId, divisionFilter);
  }

  if (auditStatus) {
    whereClause += ' AND pm.audit_status = ?';
    params.push(auditStatus);
  } else {
    whereClause += ' AND pm.audit_status IN ("pending", "flagged", "under_review")';
  }

  const total = dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM position_mappings pm WHERE ${whereClause}`, params);
  
  const rows = dbAll<Record<string, unknown>>(`
    SELECT pm.id, pm.employee_id, pm.cupa_code, pm.institutional_title, pm.employee_name, pm.division, pm.department, pm.supervisor,
      pm.vp_stem, pm.audit_status, pm.assigned_reviewer_id, pm.review_date, pm.created_at, pm.audit_cycle_id,
      cp.title as cupa_title, cp.description as cupa_description, u.name as reviewer_name
    FROM position_mappings pm LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    LEFT JOIN users u ON pm.assigned_reviewer_id = u.id
    WHERE ${whereClause} ORDER BY pm.employee_name ASC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const response: PaginatedResponse<PositionMappingWithCupa> = {
    data: rows.map(rowToPositionWithCupa), total: total?.count || 0, page, limit,
    totalPages: Math.ceil((total?.count || 0) / limit),
  };
  res.json(response);
});

reviewsRouter.get('/stats', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  let whereClause = '1=1';
  const params: unknown[] = [];

  // Use dynamic VP role lookup instead of static user.division
  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter) {
    whereClause += ' AND (assigned_reviewer_id = ? OR vp_stem = ?)';
    params.push(authReq.user.userId, divisionFilter);
  }

  const stats = dbGet<Record<string, number>>(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN audit_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN audit_status = 'under_review' THEN 1 ELSE 0 END) as under_review,
      SUM(CASE WHEN audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
      SUM(CASE WHEN audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved
    FROM position_mappings WHERE ${whereClause}
  `, params);

  res.json({
    total: stats?.total || 0, pending: stats?.pending || 0, underReview: stats?.under_review || 0,
    confirmed: stats?.confirmed || 0, flagged: stats?.flagged || 0, resolved: stats?.resolved || 0,
    needsAction: (stats?.pending || 0) + (stats?.flagged || 0),
  });
});

function checkReviewAccess(authReq: AuthenticatedRequest, position: { vp_stem: string; assigned_reviewer_id: number | null }): void {
  if (INSTITUTION_WIDE_ROLES.includes(authReq.user.role)) return;
  // Use dynamic VP role lookup instead of static user.division
  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter && position.vp_stem !== divisionFilter && position.assigned_reviewer_id !== authReq.user.userId) {
    throw new ForbiddenError('You do not have permission to review this position');
  }
}

reviewsRouter.patch('/:id/confirm', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);
  const { comment } = z.object({ comment: z.string().optional() }).parse(req.body);

  const position = dbGet<{ id: number; vp_stem: string; assigned_reviewer_id: number | null; audit_status: string; cupa_code: string | null }>(
    'SELECT id, vp_stem, assigned_reviewer_id, audit_status, cupa_code FROM position_mappings WHERE id = ?', [positionId]
  );
  if (!position) throw new NotFoundError('Position not found');

  checkReviewAccess(authReq, position);
  if (!position.cupa_code) throw new BadRequestError('Cannot confirm a position without a CUPA code mapping');

  dbRun(`UPDATE position_mappings SET audit_status = 'confirmed', review_date = datetime('now') WHERE id = ?`, [positionId]);
  dbRun(`INSERT INTO mapping_history (position_mapping_id, user_id, old_status, new_status, notes) VALUES (?, ?, ?, 'confirmed', ?)`,
    [positionId, authReq.user.userId, position.audit_status, comment || 'Position confirmed']);

  if (comment) {
    dbRun(`INSERT INTO review_comments (position_mapping_id, user_id, comment) VALUES (?, ?, ?)`, [positionId, authReq.user.userId, comment]);
  }

  res.json({ message: 'Position confirmed successfully' });
});

const flagSchema = z.object({
  reason: z.enum(['wrong_cupa_code', 'job_duties_changed', 'position_eliminated', 'new_position', 'other']),
  comment: z.string().min(1),
  suggestedCupaCode: z.string().nullable().optional(),
});

reviewsRouter.patch('/:id/flag', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);
  const data = flagSchema.parse(req.body);

  const position = dbGet<{ id: number; vp_stem: string; assigned_reviewer_id: number | null; audit_status: string }>(
    'SELECT id, vp_stem, assigned_reviewer_id, audit_status FROM position_mappings WHERE id = ?', [positionId]
  );
  if (!position) throw new NotFoundError('Position not found');

  checkReviewAccess(authReq, position);

  if (data.suggestedCupaCode) {
    const cupaExists = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [data.suggestedCupaCode]);
    if (!cupaExists) throw new BadRequestError(`Invalid CUPA code: ${data.suggestedCupaCode}`);
  }

  dbRun(`UPDATE position_mappings SET audit_status = 'flagged', review_date = datetime('now') WHERE id = ?`, [positionId]);
  dbRun(`INSERT INTO mapping_history (position_mapping_id, user_id, old_status, new_status, notes) VALUES (?, ?, ?, 'flagged', ?)`,
    [positionId, authReq.user.userId, position.audit_status, data.comment]);
  dbRun(`INSERT INTO review_comments (position_mapping_id, user_id, comment, flag_reason, suggested_cupa_code) VALUES (?, ?, ?, ?, ?)`,
    [positionId, authReq.user.userId, data.comment, data.reason, data.suggestedCupaCode || null]);

  // Notify HR admins
  const posDetails = dbGet<{ employee_name: string; institutional_title: string }>(
    'SELECT employee_name, institutional_title FROM position_mappings WHERE id = ?', [positionId]
  );
  const hrAdmins = dbAll<{ email: string }>(
    "SELECT email FROM users WHERE role IN ('system_admin','hr_admin','hr_analyst') AND is_active = 1"
  );
  if (posDetails && hrAdmins.length > 0) {
    emailHrPositionFlagged({
      hrEmails: hrAdmins.map(u => u.email),
      positionName: posDetails.employee_name,
      positionTitle: posDetails.institutional_title,
      vpName: authReq.user.email,
      reason: data.reason,
      suggestedCupaCode: data.suggestedCupaCode || null,
      positionId,
    }).catch(() => {});
  }

  res.json({ message: 'Position flagged successfully' });
});

reviewsRouter.patch('/:id/resolve', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);
  const data = z.object({ newCupaCode: z.string().nullable().optional(), comment: z.string().min(1) }).parse(req.body);

  if (!INSTITUTION_WIDE_ROLES.includes(authReq.user.role)) throw new ForbiddenError('Only HR can resolve flagged positions');

  const position = dbGet<{ id: number; audit_status: string; cupa_code: string | null }>(
    'SELECT id, audit_status, cupa_code FROM position_mappings WHERE id = ?', [positionId]
  );
  if (!position) throw new NotFoundError('Position not found');
  if (position.audit_status !== 'flagged') throw new BadRequestError('Only flagged positions can be resolved');

  if (data.newCupaCode) {
    const cupaExists = dbGet<{ cupa_code: string }>('SELECT cupa_code FROM cupa_positions WHERE cupa_code = ?', [data.newCupaCode]);
    if (!cupaExists) throw new BadRequestError(`Invalid CUPA code: ${data.newCupaCode}`);
  }

  if (data.newCupaCode !== undefined) {
    dbRun(`UPDATE position_mappings SET audit_status = 'resolved', cupa_code = ?, review_date = datetime('now') WHERE id = ?`, [data.newCupaCode, positionId]);
    dbRun(`INSERT INTO mapping_history (position_mapping_id, user_id, old_cupa_code, new_cupa_code, old_status, new_status, notes) VALUES (?, ?, ?, ?, 'flagged', 'resolved', ?)`,
      [positionId, authReq.user.userId, position.cupa_code, data.newCupaCode, data.comment]);
  } else {
    dbRun(`UPDATE position_mappings SET audit_status = 'resolved', review_date = datetime('now') WHERE id = ?`, [positionId]);
    dbRun(`INSERT INTO mapping_history (position_mapping_id, user_id, old_status, new_status, notes) VALUES (?, ?, 'flagged', 'resolved', ?)`,
      [positionId, authReq.user.userId, data.comment]);
  }

  dbRun(`INSERT INTO review_comments (position_mapping_id, user_id, comment) VALUES (?, ?, ?)`, [positionId, authReq.user.userId, `[RESOLVED] ${data.comment}`]);
  res.json({ message: 'Position resolved successfully' });
});

reviewsRouter.post('/:id/comments', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);
  const { comment } = z.object({ comment: z.string().min(1) }).parse(req.body);

  const position = dbGet<{ id: number; vp_stem: string; assigned_reviewer_id: number | null }>(
    'SELECT id, vp_stem, assigned_reviewer_id FROM position_mappings WHERE id = ?', [positionId]
  );
  if (!position) throw new NotFoundError('Position not found');

  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter && position.vp_stem !== divisionFilter && position.assigned_reviewer_id !== authReq.user.userId) {
    throw new ForbiddenError('Access denied to this position');
  }

  const result = dbRun(`INSERT INTO review_comments (position_mapping_id, user_id, comment) VALUES (?, ?, ?)`, [positionId, authReq.user.userId, comment]);

  const newComment = dbGet<Record<string, unknown>>(`
    SELECT rc.id, rc.position_mapping_id, rc.user_id, rc.comment, rc.flag_reason, rc.suggested_cupa_code, rc.created_at, u.name as user_name, u.role as user_role
    FROM review_comments rc JOIN users u ON rc.user_id = u.id WHERE rc.id = ?
  `, [result.lastInsertRowid]);

  res.status(201).json({
    id: newComment!.id, positionMappingId: newComment!.position_mapping_id, userId: newComment!.user_id,
    comment: newComment!.comment, flagReason: newComment!.flag_reason, suggestedCupaCode: newComment!.suggested_cupa_code,
    createdAt: newComment!.created_at, userName: newComment!.user_name, userRole: newComment!.user_role,
  } as ReviewCommentWithUser);
});

reviewsRouter.get('/:id/comments', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const positionId = parseInt(req.params.id);

  const position = dbGet<{ id: number; vp_stem: string; assigned_reviewer_id: number | null }>(
    'SELECT id, vp_stem, assigned_reviewer_id FROM position_mappings WHERE id = ?', [positionId]
  );
  if (!position) throw new NotFoundError('Position not found');

  const divisionFilter = getDivisionFilter(authReq.user);
  if (divisionFilter && position.vp_stem !== divisionFilter && position.assigned_reviewer_id !== authReq.user.userId) {
    throw new ForbiddenError('Access denied to this position');
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT rc.id, rc.position_mapping_id, rc.user_id, rc.comment, rc.flag_reason, rc.suggested_cupa_code, rc.created_at, u.name as user_name, u.role as user_role
    FROM review_comments rc JOIN users u ON rc.user_id = u.id WHERE rc.position_mapping_id = ? ORDER BY rc.created_at ASC
  `, [positionId]);

  res.json(rows.map(row => ({
    id: row.id, positionMappingId: row.position_mapping_id, userId: row.user_id, comment: row.comment,
    flagReason: row.flag_reason, suggestedCupaCode: row.suggested_cupa_code, createdAt: row.created_at,
    userName: row.user_name, userRole: row.user_role,
  } as ReviewCommentWithUser)));
});
