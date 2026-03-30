import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config.js';

export class ConflictError extends Error {
  status = 409;
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InvalidTransitionError extends Error {
  status = 422;
  constructor(message = 'Invalid state transition') {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

function classifyLogLevel(status: number): 'error' | 'warn' {
  if (status >= 500) return 'error';
  return 'warn';
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const status = (err as any).status || 500;
  const level = classifyLogLevel(status);
  logger[level]({ err, path: req.path, method: req.method, status }, 'Request error');
  res.status(status).json({
    error: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
