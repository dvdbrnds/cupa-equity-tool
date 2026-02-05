import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@cupa/shared';

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiError>,
  _next: NextFunction
): void {
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.');
      if (!details[path]) {
        details[path] = [];
      }
      details[path].push(issue.message);
    }
    res.status(400).json({
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      details,
    });
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}
