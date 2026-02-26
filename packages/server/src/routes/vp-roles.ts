import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, requireUserManagement } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';
import type { VpRole } from '@cupa/shared';

export const vpRolesRouter = Router();
vpRolesRouter.use(requireAuth);

function rowToVpRole(row: Record<string, unknown>): VpRole {
  return {
    id: row.id as number,
    code: row.code as string,
    title: row.title as string,
    description: row.description as string | null,
    assignedEmail: row.assigned_email as string | null,
    assignedName: row.assigned_name as string | null,
    positionCount: row.position_count as number,
    createdAt: row.created_at as string,
  };
}

// Get all VP roles
vpRolesRouter.get('/', (_req: Request, res: Response) => {
  const rows = dbAll<Record<string, unknown>>(`
    SELECT id, code, title, description, assigned_email, assigned_name, position_count, created_at
    FROM vp_roles
    ORDER BY title
  `);
  
  res.json(rows.map(rowToVpRole));
});


// Sync VP roles from position data (must be before /:id route)
vpRolesRouter.post('/sync', requireUserManagement, (_req: Request, res: Response) => {
  // Get all VP stems from positions
  const vpStems = dbAll<{ vp_stem: string; count: number }>(
    'SELECT vp_stem, COUNT(*) as count FROM position_mappings GROUP BY vp_stem'
  );
  
  let created = 0;
  let updated = 0;
  
  for (const { vp_stem, count } of vpStems) {
    if (!vp_stem || vp_stem.trim() === '') continue;
    
    const existing = dbGet<{ id: number }>('SELECT id FROM vp_roles WHERE code = ?', [vp_stem]);
    
    if (existing) {
      dbRun('UPDATE vp_roles SET position_count = ? WHERE id = ?', [count, existing.id]);
      updated++;
    } else {
      dbRun(
        'INSERT INTO vp_roles (code, title, position_count) VALUES (?, ?, ?)',
        [vp_stem, vp_stem, count]
      );
      created++;
    }
  }
  
  res.json({ message: 'VP roles synced', created, updated });
});

// Get single VP role
vpRolesRouter.get('/:id', (req: Request, res: Response) => {
  const row = dbGet<Record<string, unknown>>(`
    SELECT id, code, title, description, assigned_email, assigned_name, position_count, created_at
    FROM vp_roles
    WHERE id = ?
  `, [req.params.id]);
  
  if (!row) throw new NotFoundError('VP Role not found');
  res.json(rowToVpRole(row));
});

// Assign email to VP role
const assignSchema = z.object({
  email: z.string().email().nullable(),
  name: z.string().nullable().optional(),
});

vpRolesRouter.post('/:id/assign', requireUserManagement, (req: Request, res: Response) => {
  const { email, name } = assignSchema.parse(req.body);
  const roleId = parseInt(req.params.id);
  
  // Verify role exists
  const role = dbGet<{ id: number; assigned_name: string | null }>('SELECT id, assigned_name FROM vp_roles WHERE id = ?', [roleId]);
  if (!role) throw new NotFoundError('VP Role not found');
  
  // If this email is assigned to another role, clear that assignment first
  if (email) {
    dbRun(
      'UPDATE vp_roles SET assigned_email = NULL, assigned_name = NULL WHERE assigned_email = ? AND id != ?',
      [email.toLowerCase(), roleId]
    );
  }
  
  // Use provided name, or keep existing name if not supplied, or derive from email prefix
  const resolvedName = name !== undefined ? name : (role.assigned_name ?? email?.split('@')[0] ?? null);
  
  // Update the role assignment
  dbRun(
    'UPDATE vp_roles SET assigned_email = ?, assigned_name = ? WHERE id = ?',
    [email?.toLowerCase() || null, resolvedName, roleId]
  );
  
  // Return updated role
  const updatedRow = dbGet<Record<string, unknown>>(`
    SELECT id, code, title, description, assigned_email, assigned_name, position_count, created_at
    FROM vp_roles WHERE id = ?
  `, [roleId]);
  
  res.json(rowToVpRole(updatedRow!));
});

// Update VP role details (title, description)
const updateRoleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

vpRolesRouter.patch('/:id', requireUserManagement, (req: Request, res: Response) => {
  const data = updateRoleSchema.parse(req.body);
  const roleId = parseInt(req.params.id);
  
  const role = dbGet<{ id: number }>('SELECT id FROM vp_roles WHERE id = ?', [roleId]);
  if (!role) throw new NotFoundError('VP Role not found');
  
  const updates: string[] = [];
  const params: unknown[] = [];
  
  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  
  if (updates.length > 0) {
    params.push(roleId);
    dbRun(`UPDATE vp_roles SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  
  const updatedRow = dbGet<Record<string, unknown>>(`
    SELECT id, code, title, description, assigned_email, assigned_name, position_count, created_at
    FROM vp_roles WHERE id = ?
  `, [roleId]);
  
  res.json(rowToVpRole(updatedRow!));
});

