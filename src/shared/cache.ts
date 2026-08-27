import { RedisService } from '../infrastructure/redis/RedisService.js';

const PREFIX = 'totli:';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await RedisService.get(PREFIX + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60): Promise<void> {
  await RedisService.set(PREFIX + key, JSON.stringify(value), ttlSec);
}

export async function cacheDel(key: string): Promise<void> {
  await RedisService.del(PREFIX + key);
}

export async function cacheDelPatternHint(keys: string[]): Promise<void> {
  for (const k of keys) {
    await cacheDel(k);
  }
}
