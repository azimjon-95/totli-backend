import type { Request, Response } from 'express';
import { getConnectionState } from '../../infrastructure/database/mongo.js';
import { getRedis } from '../../infrastructure/redis/client.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { paymentProviderStatus } from '../../config/env.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { CatalogService } from '../catalog/catalog.service.js';

export function healthCheck(_req: Request, res: Response) {
  const dbState = getConnectionState();
  const redis = getRedis();

  const database = dbState === 1 ? 'connected' : 'disconnected';
  const redisStatus =
    redis && (redis.status === 'ready' || redis.status === 'connect')
      ? 'connected'
      : 'disconnected';

  const status = database === 'connected' ? 'ok' : 'degraded';

  const payload = {
    status,
    database,
    redis: redisStatus,
    telegram: TelegramService.isConfigured() ? 'configured' : 'not_configured',
    // Cache state only — health checks must not depend on (or hammer) the upstream.
    catalog: CatalogService.status(),
    payments: paymentProviderStatus(),
    timestamp: new Date().toISOString(),
  };

  if (status !== 'ok') {
    return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Database is not connected');
  }

  return sendSuccess(res, payload);
}

/** Readiness for k8s/deploy — fails if DB down */
export function readinessCheck(_req: Request, res: Response) {
  const dbState = getConnectionState();
  if (dbState !== 1) {
    return res.status(503).json({
      success: false,
      error: { code: 'NOT_READY', message: 'Database not connected' },
    });
  }
  return sendSuccess(res, { ready: true });
}

export function livenessCheck(_req: Request, res: Response) {
  return sendSuccess(res, { alive: true });
}
