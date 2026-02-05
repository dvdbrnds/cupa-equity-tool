import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, requireEditor, type AuthenticatedRequest } from '../middleware/auth.js';
import { NotFoundError, BadRequestError } from '../middleware/error-handler.js';
import type { AuditCycle, AuditCycleWithStats, AuditCycleStatus } from '@cupa/shared';

export const auditCyclesRouter = Router();
auditCyclesRouter.use(requireAuth);

function rowToAuditCycle(row: Record<string, unknown>): AuditCycle {
  return {
    id: row.id as number,
    name: row.name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string | null,
    status: row.status as AuditCycleStatus,
    createdById: row.created_by_id as number,
    createdAt: row.created_at as string,
  };
}

function rowToAuditCycleWithStats(row: Record<string, unknown>): AuditCycleWithStats {
  return {
    ...rowToAuditCycle(row),
    totalPositions: (row.total_positions as number) || 0,
    pendingCount: (row.pending_count as number) || 0,
    confirmedCount: (row.confirmed_count as number) || 0,
    flaggedCount: (row.flagged_count as number) || 0,
    resolvedCount: (row.resolved_count as number) || 0,
  };
}

auditCyclesRouter.get('/', (_req: Request, res: Response) => {
  const rows = dbAll<Record<string, unknown>>(`
    SELECT ac.id, ac.name, ac.start_date, ac.end_date, ac.status, ac.created_by_id, ac.created_at,
      COUNT(pm.id) as total_positions,
      SUM(CASE WHEN pm.audit_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN pm.audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
      SUM(CASE WHEN pm.audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
      SUM(CASE WHEN pm.audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
    FROM audit_cycles ac LEFT JOIN position_mappings pm ON ac.id = pm.audit_cycle_id
    GROUP BY ac.id ORDER BY ac.created_at DESC
  `);
  res.json(rows.map(rowToAuditCycleWithStats));
});

auditCyclesRouter.get('/:id', (req: Request, res: Response) => {
  const row = dbGet<Record<string, unknown>>(`
    SELECT ac.id, ac.name, ac.start_date, ac.end_date, ac.status, ac.created_by_id, ac.created_at,
      COUNT(pm.id) as total_positions,
      SUM(CASE WHEN pm.audit_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN pm.audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
      SUM(CASE WHEN pm.audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
      SUM(CASE WHEN pm.audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
    FROM audit_cycles ac LEFT JOIN position_mappings pm ON ac.id = pm.audit_cycle_id
    WHERE ac.id = ? GROUP BY ac.id
  `, [req.params.id]);
  if (!row) throw new NotFoundError('Audit cycle not found');
  res.json(rowToAuditCycleWithStats(row));
});

auditCyclesRouter.get('/:id/progress-by-vp', (req: Request, res: Response) => {
  const cycleId = parseInt(req.params.id);
  const cycle = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE id = ?', [cycleId]);
  if (!cycle) throw new NotFoundError('Audit cycle not found');

  const rows = dbAll<Record<string, unknown>>(`
    SELECT vp_stem, COUNT(*) as total_positions,
      SUM(CASE WHEN audit_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
      SUM(CASE WHEN audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved
    FROM position_mappings WHERE audit_cycle_id = ? GROUP BY vp_stem ORDER BY vp_stem
  `, [cycleId]);

  res.json(rows.map(r => ({
    vpStem: r.vp_stem, totalPositions: r.total_positions,
    pending: r.pending, confirmed: r.confirmed, flagged: r.flagged, resolved: r.resolved,
  })));
});

const createCycleSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
});

auditCyclesRouter.post('/', requireEditor, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const data = createCycleSchema.parse(req.body);
  
  const result = dbRun(`
    INSERT INTO audit_cycles (name, start_date, end_date, created_by_id) VALUES (?, ?, ?, ?)
  `, [data.name, data.startDate, data.endDate || null, authReq.user.userId]);

  const newCycle = dbGet<Record<string, unknown>>(`
    SELECT id, name, start_date, end_date, status, created_by_id, created_at FROM audit_cycles WHERE id = ?
  `, [result.lastInsertRowid]);

  res.status(201).json({
    ...rowToAuditCycle(newCycle!),
    totalPositions: 0, pendingCount: 0, confirmedCount: 0, flaggedCount: 0, resolvedCount: 0,
  });
});

const updateCycleSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
});

auditCyclesRouter.patch('/:id', requireEditor, (req: Request, res: Response) => {
  const data = updateCycleSchema.parse(req.body);
  const cycleId = parseInt(req.params.id);

  const existing = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE id = ?', [cycleId]);
  if (!existing) throw new NotFoundError('Audit cycle not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.startDate !== undefined) { updates.push('start_date = ?'); params.push(data.startDate); }
  if (data.endDate !== undefined) { updates.push('end_date = ?'); params.push(data.endDate); }
  if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }

  if (updates.length === 0) throw new BadRequestError('No fields to update');

  params.push(cycleId);
  dbRun(`UPDATE audit_cycles SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = dbGet<Record<string, unknown>>(`
    SELECT ac.id, ac.name, ac.start_date, ac.end_date, ac.status, ac.created_by_id, ac.created_at,
      COUNT(pm.id) as total_positions,
      SUM(CASE WHEN pm.audit_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN pm.audit_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
      SUM(CASE WHEN pm.audit_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count,
      SUM(CASE WHEN pm.audit_status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
    FROM audit_cycles ac LEFT JOIN position_mappings pm ON ac.id = pm.audit_cycle_id WHERE ac.id = ? GROUP BY ac.id
  `, [cycleId]);

  res.json(rowToAuditCycleWithStats(updated!));
});

auditCyclesRouter.post('/:id/assign-positions', requireEditor, (req: Request, res: Response) => {
  const data = z.object({
    positionIds: z.array(z.number()).optional(),
    vpStem: z.string().optional(),
    assignAll: z.boolean().optional(),
  }).parse(req.body);
  const cycleId = parseInt(req.params.id);

  const cycle = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE id = ?', [cycleId]);
  if (!cycle) throw new NotFoundError('Audit cycle not found');

  let updated = 0;

  if (data.assignAll) {
    const result = dbRun(`UPDATE position_mappings SET audit_cycle_id = ?, audit_status = 'pending' WHERE audit_cycle_id IS NULL`, [cycleId]);
    updated = result.changes;
  } else if (data.vpStem) {
    const result = dbRun(`UPDATE position_mappings SET audit_cycle_id = ?, audit_status = 'pending' WHERE vp_stem = ? AND (audit_cycle_id IS NULL OR audit_cycle_id != ?)`, [cycleId, data.vpStem, cycleId]);
    updated = result.changes;
  } else if (data.positionIds && data.positionIds.length > 0) {
    const placeholders = data.positionIds.map(() => '?').join(',');
    const result = dbRun(`UPDATE position_mappings SET audit_cycle_id = ?, audit_status = 'pending' WHERE id IN (${placeholders})`, [cycleId, ...data.positionIds]);
    updated = result.changes;
  } else {
    throw new BadRequestError('Must specify positionIds, vpStem, or assignAll');
  }

  res.json({ message: `${updated} position(s) assigned to audit cycle` });
});

// Delete an audit cycle
auditCyclesRouter.delete('/:id', requireEditor, (req: Request, res: Response) => {
  const cycleId = parseInt(req.params.id);

  const cycle = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE id = ?', [cycleId]);
  if (!cycle) throw new NotFoundError('Audit cycle not found');

  // Unassign positions from this audit cycle (don't delete them)
  dbRun('UPDATE position_mappings SET audit_cycle_id = NULL, audit_status = ? WHERE audit_cycle_id = ?', ['pending', cycleId]);
  
  // Delete the audit cycle
  dbRun('DELETE FROM audit_cycles WHERE id = ?', [cycleId]);

  res.json({ message: 'Audit cycle deleted' });
});

auditCyclesRouter.post('/:id/assign-reviewers', requireEditor, (req: Request, res: Response) => {
  const cycleId = parseInt(req.params.id);

  const cycle = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE id = ?', [cycleId]);
  if (!cycle) throw new NotFoundError('Audit cycle not found');

  // Get VP roles with assigned users (by email)
  const vpRoles = dbAll<{ code: string; assigned_email: string }>(`
    SELECT code, assigned_email FROM vp_roles WHERE assigned_email IS NOT NULL
  `);

  let totalUpdated = 0;
  for (const vpRole of vpRoles) {
    // Find the user account for this email
    const user = dbGet<{ id: number }>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [vpRole.assigned_email]);
    if (!user) continue;

    // Assign this user to positions matching their VP division
    const result = dbRun(`
      UPDATE position_mappings SET assigned_reviewer_id = ?
      WHERE audit_cycle_id = ? AND vp_stem = ? AND assigned_reviewer_id IS NULL
    `, [user.id, cycleId, vpRole.code]);
    totalUpdated += result.changes;
  }

  res.json({ message: `Assigned reviewers to ${totalUpdated} position(s)`, reviewersMatched: vpRoles.length });
});
