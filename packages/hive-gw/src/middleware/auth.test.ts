import { describe, it, expect, vi } from 'vitest';
import { authMiddleware } from './auth.js';

function makeReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  it('rejects request without Authorization header with 401', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects Basic auth scheme with 401', () => {
    const req = makeReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid Bearer token with 401', () => {
    const req = makeReq({ authorization: 'Bearer invalid-token' });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through with valid manager token and sets req.user', () => {
    const req = makeReq({ authorization: 'Bearer hive-token-manager' });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('manager');
    expect(req.user.name).toBe('主管');
  });

  it('passes through with valid ad_buyer token and sets req.user', () => {
    const req = makeReq({ authorization: 'Bearer hive-token-ad-buyer' });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('ad_buyer');
  });
});
