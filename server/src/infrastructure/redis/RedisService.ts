import { getRedis } from './client.js';
import { logger } from '../logger/index.js';

/**
 * Thin abstraction over Redis for future cache / rate-limit / queue usage.
 */
export const RedisService = {
  isReady(): boolean {
    const client = getRedis();
    return Boolean(client && (client.status === 'ready' || client.status === 'connect'));
  },

  async get(key: string): Promise<string | null> {
    const client = getRedis() as { get?: (k: string) => Promise<string | null> } | null;
    if (!client?.get) return null;
    try {
      return await client.get(key);
    } catch (err) {
      logger.warn('Redis get failed', { key, error: String(err) });
      return null;
    }
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const client = getRedis() as {
      set?: (k: string, v: string, ...args: unknown[]) => Promise<unknown>;
    } | null;
    if (!client?.set) return false;
    try {
      if (ttlSeconds) {
        await client.set(key, value, 'EX', ttlSeconds);
      } else {
        await client.set(key, value);
      }
      return true;
    } catch (err) {
      logger.warn('Redis set failed', { key, error: String(err) });
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    const client = getRedis() as { del?: (k: string) => Promise<number> } | null;
    if (!client?.del) return false;
    try {
      await client.del(key);
      return true;
    } catch {
      return false;
    }
  },
};
