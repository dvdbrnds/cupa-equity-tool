import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import express from 'express';
import { z } from 'zod';
import { dbGet, dbRun } from '../db/init.js';
import { generateToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { UnauthorizedError, BadRequestError } from '../middleware/error-handler.js';
import { SAML_ENABLED, findOrCreateSamlUser, getSpMetadata } from '../auth/saml.js';
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
  // Check if request came through HTTPS (via X-Forwarded-Proto from reverse proxy)
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isSecure = forwardedProto === 'https' || req.secure;
  
  // TEMP: Allow non-secure cookies for dev until proper domain is configured
  // TODO: Remove ALLOW_INSECURE_COOKIES env var once cupa.moravian.edu has SSL
  const useSecureCookie = process.env.ALLOW_INSECURE_COOKIES === 'true' ? false : isSecure;
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: useSecureCookie,
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

// ── SAML / Okta SSO Routes ─────────────────────────────────────────────────

// GET /api/auth/saml/enabled - Check if SAML is configured
authRouter.get('/saml/enabled', (_req: Request, res: Response) => {
  res.json({ enabled: SAML_ENABLED });
});

// GET /api/auth/saml/login - Initiates SAML authentication (redirects to Okta)
authRouter.get('/saml/login', (req: Request, res: Response, next) => {
  if (!SAML_ENABLED) {
    res.status(404).json({ error: 'SAML SSO is not configured' });
    return;
  }

  passport.authenticate('saml', {
    session: false,
    failureRedirect: '/login?error=saml_failed',
  })(req, res, next);
});

// POST /api/auth/saml/callback - Okta posts SAML response here (ACS URL)
authRouter.post(
  '/saml/callback',
  express.urlencoded({ extended: false }),
  (req: Request, res: Response) => {
    if (!SAML_ENABLED) {
      res.status(404).json({ error: 'SAML SSO is not configured' });
      return;
    }

    passport.authenticate('saml', { session: false }, (err: Error | null, user: User | false) => {
      if (err) {
        console.error('SAML authentication error:', err.message);
        res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
        return;
      }

      if (!user) {
        res.redirect('/login?error=saml_no_user');
        return;
      }

      // Generate JWT and set cookie (same as local login)
      try {
        const token = generateToken(user);

        const forwardedProto = req.headers['x-forwarded-proto'];
        const isSecure = forwardedProto === 'https' || req.secure;
        const useSecureCookie = process.env.ALLOW_INSECURE_COOKIES === 'true' ? false : isSecure;

        res.cookie('token', token, {
          httpOnly: true,
          secure: useSecureCookie,
          sameSite: 'lax',
          maxAge: 8 * 60 * 60 * 1000,
        });

        // Redirect to app dashboard
        res.redirect('/');
      } catch (tokenErr) {
        console.error('Token generation error:', tokenErr);
        res.redirect('/login?error=token_failed');
      }
    })(req, res);
  }
);

// GET /api/auth/saml/metadata - SP metadata for Okta admin setup
authRouter.get('/saml/metadata', (_req: Request, res: Response) => {
  const metadata = getSpMetadata();
  if (!metadata) {
    res.status(404).json({ error: 'SAML not configured' });
    return;
  }
  res.type('application/xml');
  res.send(metadata);
});
