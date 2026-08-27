import { RedisService } from '../infrastructure/redis/RedisService.js';

const PREFIX = 'idem:';

/** Returns existing value if key already set, otherwise sets value and returns null */
export async function getOrSetIdempotency(
  key: string,
  value: string,
  ttlSec = 86_400
): Promise<string | null> {
  const full = PREFIX + key;
  const existing = await RedisService.get(full);
  if (existing) return existing;
  await RedisService.set(full, value, ttlSec);
  return null;
}

export async function getIdempotency(key: string): Promise<string | null> {
  return RedisService.get(PREFIX + key);
}

export async function setIdempotency(
  key: string,
  value: string,
  ttlSec = 86_400
): Promise<void> {
  await RedisService.set(PREFIX + key, value, ttlSec);
}
