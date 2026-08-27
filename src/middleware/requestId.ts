import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length < 64
      ? incoming
      : randomBytes(8).toString('hex');
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
