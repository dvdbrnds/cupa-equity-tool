import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/init.js';
import { requireAuth, requireUserManagement, type AuthenticatedRequest } from '../middleware/auth.js';
import { NotFoundError, ConflictError, BadRequestError } from '../middleware/error-handler.js';
import type { User, PaginatedResponse, UserRole } from '@cupa/shared';

export const usersRouter = Router();

// All routes require authentication
usersRouter.use(requireAuth);

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['system_admin', 'hr_admin', 'hr_analyst', 'vp_reviewer', 'executive', 'academic_dean']),
  division: z.string().nullable().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(1, 'Name is required').optional(),
  role: z.enum(['system_admin', 'hr_admin', 'hr_analyst', 'vp_reviewer', 'executive', 'academic_dean']).optional(),
  division: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    role: row.role as UserRole,
    division: row.division as string | null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  };
}

// GET /api/users - List all users (admin only)
usersRouter.get('/', requireUserManagement, (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const role = req.query.role as string | undefined;

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (search) {
    whereClause += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }

  const total = dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM users WHERE ${whereClause}`, params);
  
  const rows = dbAll<Record<string, unknown>>(`
    SELECT id, email, name, role, division, is_active, created_at
    FROM users
    WHERE ${whereClause}
    ORDER BY name ASC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const response: PaginatedResponse<User> = {
    data: rows.map(rowToUser),
    total: total?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((total?.count || 0) / limit),
  };

  res.json(response);
});

// GET /api/users/:id - Get single user (admin only)
usersRouter.get('/:id', requireUserManagement, (req: Request, res: Response) => {
  const row = dbGet<Record<string, unknown>>(`
    SELECT id, email, name, role, division, is_active, created_at
    FROM users
    WHERE id = ?
  `, [req.params.id]);

  if (!row) {
    throw new NotFoundError('User not found');
  }

  res.json(rowToUser(row));
});

// POST /api/users - Create new user (admin only)
usersRouter.post('/', requireUserManagement, (req: Request, res: Response) => {
  const data = createUserSchema.parse(req.body);
  
  // Check for existing email
  const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', [data.email]);
  if (existing) {
    throw new ConflictError('A user with this email already exists');
  }

  const passwordHash = bcrypt.hashSync(data.password, 10);
  
  const result = dbRun(`
    INSERT INTO users (email, password_hash, name, role, division)
    VALUES (?, ?, ?, ?, ?)
  `, [data.email, passwordHash, data.name, data.role, data.division || null]);

  const newUser = dbGet<Record<string, unknown>>(`
    SELECT id, email, name, role, division, is_active, created_at
    FROM users
    WHERE id = ?
  `, [result.lastInsertRowid]);

  res.status(201).json(rowToUser(newUser!));
});

// PATCH /api/users/:id - Update user (admin only)
usersRouter.patch('/:id', requireUserManagement, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const data = updateUserSchema.parse(req.body);
  const userId = parseInt(req.params.id);

  // Check user exists
  const existing = dbGet<{ id: number; email: string }>('SELECT id, email FROM users WHERE id = ?', [userId]);
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  // Prevent self-demotion from admin
  if (userId === authReq.user.userId && data.role && data.role !== 'system_admin') {
    throw new BadRequestError('Cannot remove your own admin role');
  }

  // Check email uniqueness if changing
  if (data.email && data.email !== existing.email) {
    const emailExists = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ? AND id != ?', [data.email, userId]);
    if (emailExists) {
      throw new ConflictError('A user with this email already exists');
    }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.role !== undefined) {
    updates.push('role = ?');
    params.push(data.role);
  }
  if (data.division !== undefined) {
    updates.push('division = ?');
    params.push(data.division);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    throw new BadRequestError('No fields to update');
  }

  params.push(userId);
  dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = dbGet<Record<string, unknown>>(`
    SELECT id, email, name, role, division, is_active, created_at
    FROM users
    WHERE id = ?
  `, [userId]);

  res.json(rowToUser(updated!));
});

// DELETE /api/users/:id - Delete user (admin only)
usersRouter.delete('/:id', requireUserManagement, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = parseInt(req.params.id);

  // Prevent self-deletion
  if (userId === authReq.user.userId) {
    throw new BadRequestError('Cannot delete your own account');
  }

  const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [userId]);
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  // Soft delete - just deactivate
  dbRun('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);

  res.json({ message: 'User deactivated successfully' });
});

// POST /api/users/:id/reset-password - Reset user password (admin only)
const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

usersRouter.post('/:id/reset-password', requireUserManagement, (req: Request, res: Response) => {
  const { newPassword } = resetPasswordSchema.parse(req.body);
  const userId = parseInt(req.params.id);

  const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [userId]);
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

  res.json({ message: 'Password reset successfully' });
});
