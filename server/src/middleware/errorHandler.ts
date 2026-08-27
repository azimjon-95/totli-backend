import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors.js';
import { logger } from '../infrastructure/logger/index.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('AppError', {
        requestId,
        code: err.code,
        message: err.message,
        path: req.path,
      });
    }
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  logger.error('Unhandled error', {
    requestId,
    path: req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: isProd ? undefined : err instanceof Error ? err.stack : undefined,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd
        ? `Xatolik yuz berdi${requestId ? `. Kod: ${requestId}` : ''}`
        : err instanceof Error
          ? err.message
          : 'Internal server error',
      ...(requestId ? { requestId } : {}),
    },
  });
}
