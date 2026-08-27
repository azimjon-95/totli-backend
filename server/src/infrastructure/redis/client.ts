import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';

/**
 * Minimal Redis client foundation.
 * Used later for: caching, rate limiting, queues, sessions, notification retry.
 */

type RedisLike = {
  status: string;
  quit: () => Promise<string>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  connect?: () => Promise<void>;
  ping?: () => Promise<string>;
};

let redisClient: RedisLike | null = null;
let connectionAttempted = false;

export async function connectRedis(): Promise<void> {
  if (connectionAttempted) return;
  connectionAttempted = true;

  try {
    const { Redis } = await import('ioredis');
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err: Error) => {
      logger.error('Redis error', { error: err.message });
    });
    client.on('close', () => logger.warn('Redis connection closed'));

    // Wait briefly for ready or fail soft
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), 2000);
      client.on('ready', () => {
        clearTimeout(t);
        resolve();
      });
    });

    redisClient = client as unknown as RedisLike;
  } catch (error) {
    logger.warn('Redis unavailable — continuing without cache', {
      error: error instanceof Error ? error.message : String(error),
    });
    redisClient = null;
  }
}

export function getRedis() {
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // ignore
    }
    redisClient = null;
    logger.info('Redis disconnected');
  }
}
