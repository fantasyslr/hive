import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ConflictError, NotFoundError, errorHandler } from './error-handler.js';
import { logger } from '../config.js';

describe('errorHandler', () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const req = { path: '/tasks/123/claim', method: 'POST' } as Request;
  const next = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.restoreAllMocks();
    status.mockClear();
    json.mockClear();
  });

  it('logs 4xx request errors as warnings', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    errorHandler(new ConflictError('Version mismatch'), req, res, next);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(409);
  });

  it('logs 5xx request errors as errors', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    errorHandler(new Error('Boom'), req, res, next);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
  });

  it('still returns 404 for not found errors', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    errorHandler(new NotFoundError('Missing'), req, res, next);

    expect(status).toHaveBeenCalledWith(404);
  });
});
