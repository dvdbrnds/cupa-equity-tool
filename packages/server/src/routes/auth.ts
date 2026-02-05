import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { dbGet, dbRun } from '../db/init.js';
import { generateToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { UnauthorizedError, BadRequestError } from '../middleware/error-handler.js';
import type { User, AuthSession } from '@cupa/shared';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  
  const user = dbGet<{ 
    id: number; 
    email: string; 
    password_hash: string; 
    name: string; 
    role: string; 
    division: string | null;
    is_active: number;
    created_at: string;
  }>(`
    SELECT id, email, password_hash, name, role, division, is_active, created_at
    FROM users
    WHERE email = ?
  `, [email]);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is disabled');
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const userResponse: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as User['role'],
    division: user.division,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
  };

  const token = generateToken(userResponse);

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });

  const session: AuthSession = {
    user: userResponse,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };

  res.json(session);
});

// POST /api/auth/logout
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/session
authRouter.get('/session', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  const user = dbGet<{
    id: number;
    email: string;
    name: string;
    role: string;
    division: string | null;
    is_active: number;
    created_at: string;
  }>(`
    SELECT id, email, name, role, division, is_active, created_at
    FROM users
    WHERE id = ?
  `, [authReq.user.userId]);

  if (!user || !user.is_active) {
    res.clearCookie('token');
    throw new UnauthorizedError('Session expired');
  }

  const userResponse: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as User['role'],
    division: user.division,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
  };

  const session: AuthSession = {
    user: userResponse,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };

  res.json(session);
});

// POST /api/auth/change-password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

authRouter.post('/change-password', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = dbGet<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [authReq.user.userId]);

  if (!user) {
    throw new BadRequestError('User not found');
  }

  const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!validPassword) {
    throw new BadRequestError('Current password is incorrect');
  }

  const newPasswordHash = bcrypt.hashSync(newPassword, 10);
  dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, authReq.user.userId]);

  // Clear token to force re-login
  res.clearCookie('token');
  res.json({ message: 'Password changed successfully. Please log in again.' });
});
