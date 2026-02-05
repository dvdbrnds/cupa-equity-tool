import { Router, type Request, type Response } from 'express';
import { dbAll, dbGet } from '../db/init.js';
import { requireAuth, getDivisionFilter, type AuthenticatedRequest } from '../middleware/auth.js';
import type { DashboardStats, AuditProgressByVp } from '@cupa/shared';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/stats', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const divisionFilter = getDivisionFilter(authReq.user);

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause = 'vp_stem = ?';
    params.push(divisionFilter);
  }

  const positionStats = dbGet<Record<string, number>>(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN cupa_code IS NOT NULL THEN 1 ELSE 0 END) as mapped,
      SUM(CASE WHEN cupa_code IS NULL THEN 1 ELSE 0 END) as unmapped,
      SUM(CASE WHEN audit_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM position_mappings WHERE ${whereClause}
  `, params);

  const cupaCount = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM cupa_positions');
  const activeCycles = dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM audit_cycles WHERE status = 'active'`);

  const stats: DashboardStats = {
    totalPositions: positionStats?.total || 0,
    mappedPositions: positionStats?.mapped || 0,
    unmappedPositions: positionStats?.unmapped || 0,
    totalCupaCodes: cupaCount?.count || 0,
    activeAuditCycles: activeCycles?.count || 0,
    pendingReviews: positionStats?.pending || 0,
  };

  res.json(stats);
});

dashboardRouter.get('/audit-progress', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const auditCycleId = req.query.auditCycleId as string | undefined;
  const divisionFilter = getDivisionFilter(authReq.user);

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause += ' AND vp_stem = ?';
    params.push(divisionFilter);
  }

  if (auditCycleId) {
    whereClause += ' AND audit_cycle_id = ?';
    params.push(parseInt(auditCycleId));
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT vp_stem, COUNT(*) as total_positions,
      SUM(CASE WHEN audit_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
      SUM(CASE WHEN audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved
    FROM position_mappings WHERE ${whereClause} GROUP BY vp_stem ORDER BY vp_stem
  `, params);

  const progress: AuditProgressByVp[] = rows.map(row => ({
    vpStem: row.vp_stem as string, vpTitle: null, totalPositions: row.total_positions as number,
    pending: row.pending as number, confirmed: row.confirmed as number,
    flagged: row.flagged as number, resolved: row.resolved as number,
  }));

  res.json(progress);
});

dashboardRouter.get('/recent-activity', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const divisionFilter = getDivisionFilter(authReq.user);

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause = 'pm.vp_stem = ?';
    params.push(divisionFilter);
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT mh.id, mh.position_mapping_id, mh.old_cupa_code, mh.new_cupa_code, mh.old_status, mh.new_status, mh.notes, mh.created_at,
      u.name as user_name, pm.employee_name, pm.institutional_title
    FROM mapping_history mh
    JOIN users u ON mh.user_id = u.id
    JOIN position_mappings pm ON mh.position_mapping_id = pm.id
    WHERE ${whereClause} ORDER BY mh.created_at DESC LIMIT ?
  `, [...params, limit]);

  res.json(rows.map(row => ({
    id: row.id, positionMappingId: row.position_mapping_id, oldCupaCode: row.old_cupa_code, newCupaCode: row.new_cupa_code,
    oldStatus: row.old_status, newStatus: row.new_status, notes: row.notes, createdAt: row.created_at,
    userName: row.user_name, employeeName: row.employee_name, institutionalTitle: row.institutional_title,
  })));
});

dashboardRouter.get('/flagged-positions', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const divisionFilter = getDivisionFilter(authReq.user);

  let whereClause = 'pm.audit_status = "flagged"';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause += ' AND pm.vp_stem = ?';
    params.push(divisionFilter);
  }

  const rows = dbAll<Record<string, unknown>>(`
    SELECT pm.id, pm.employee_id, pm.employee_name, pm.institutional_title, pm.vp_stem, pm.cupa_code, cp.title as cupa_title
    FROM position_mappings pm LEFT JOIN cupa_positions cp ON pm.cupa_code = cp.cupa_code
    WHERE ${whereClause} LIMIT ?
  `, [...params, limit]);

  res.json(rows.map(row => ({
    id: row.id, employeeId: row.employee_id, employeeName: row.employee_name, institutionalTitle: row.institutional_title,
    vpStem: row.vp_stem, cupaCode: row.cupa_code, cupaTitle: row.cupa_title,
  })));
});

dashboardRouter.get('/status-summary', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const auditCycleId = req.query.auditCycleId as string | undefined;
  const divisionFilter = getDivisionFilter(authReq.user);

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (divisionFilter) {
    whereClause += ' AND vp_stem = ?';
    params.push(divisionFilter);
  }

  if (auditCycleId) {
    whereClause += ' AND audit_cycle_id = ?';
    params.push(parseInt(auditCycleId));
  }

  const rows = dbAll<{ audit_status: string; count: number }>(`
    SELECT audit_status, COUNT(*) as count FROM position_mappings WHERE ${whereClause} GROUP BY audit_status
  `, params);

  const summary: Record<string, number> = { pending: 0, under_review: 0, confirmed: 0, flagged: 0, resolved: 0 };
  for (const row of rows) summary[row.audit_status] = row.count;

  res.json(summary);
});
