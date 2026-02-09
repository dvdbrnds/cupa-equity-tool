import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@cupa/shared';
import { INSTITUTION_WIDE_ROLES, EDITOR_ROLES, USER_MANAGEMENT_ROLES } from '@cupa/shared';
import { UnauthorizedError, ForbiddenError } from './error-handler.js';
import { dbGet } from '../db/init.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
  division: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    division: user.division,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// Middleware to require authentication
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.token;

  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

// Middleware to require specific roles
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
}

// Middleware to require institution-wide access (HR, admin, executive)
export function requireInstitutionWideAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!INSTITUTION_WIDE_ROLES.includes(authReq.user.role)) {
    throw new ForbiddenError('Institution-wide access required');
  }

  next();
}

// Middleware to require editor access
export function requireEditor(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!EDITOR_ROLES.includes(authReq.user.role)) {
    throw new ForbiddenError('Editor access required');
  }

  next();
}

// Middleware to require user management access
export function requireUserManagement(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!USER_MANAGEMENT_ROLES.includes(authReq.user.role)) {
    throw new ForbiddenError('User management access required');
  }

  next();
}

// Helper to get the VP role code for a user by their email
export function getVpRoleCodeByEmail(email: string): string | null {
  const role = dbGet<{ code: string }>(
    'SELECT code FROM vp_roles WHERE LOWER(assigned_email) = LOWER(?)',
    [email]
  );
  return role?.code || null;
}

// Helper to check if user can access a specific division
export function canAccessDivision(user: JwtPayload, division: string): boolean {
  // Institution-wide roles can access any division
  if (INSTITUTION_WIDE_ROLES.includes(user.role)) {
    return true;
  }
  
  // Use the division stored on the user record first, then fall back to vp_roles lookup
  const userDivision = user.division || getVpRoleCodeByEmail(user.email);
  return userDivision === division;
}

// Helper to get division filter for queries
export function getDivisionFilter(user: JwtPayload): string | null {
  // Institution-wide roles see all divisions (return null for no filter)
  if (INSTITUTION_WIDE_ROLES.includes(user.role)) {
    return null;
  }
  
  // Use the division stored on the user record first, then fall back to vp_roles lookup
  return user.division || getVpRoleCodeByEmail(user.email);
}
