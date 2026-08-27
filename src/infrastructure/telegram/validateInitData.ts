import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { UnauthorizedError, ValidationError } from '../../shared/errors.js';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  raw: Record<string, string>;
}

/**
 * Official Telegram WebApp initData validation.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(initData: string): ValidatedInitData {
  if (!initData || typeof initData !== 'string') {
    throw new ValidationError('initData is required');
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new UnauthorizedError('Telegram bot is not configured');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new UnauthorizedError('Missing hash in initData');
  }

  params.delete('hash');

  // Sort keys alphabetically and build data-check-string
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (calculatedHash !== hash) {
    throw new UnauthorizedError('Invalid Telegram initData signature');
  }

  const authDateStr = params.get('auth_date');
  if (!authDateStr) {
    throw new UnauthorizedError('Missing auth_date');
  }

  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate)) {
    throw new UnauthorizedError('Invalid auth_date');
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > env.TELEGRAM_AUTH_MAX_AGE_SEC) {
    throw new UnauthorizedError('Telegram initData has expired');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new UnauthorizedError('Missing user in initData');
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new UnauthorizedError('Invalid user payload in initData');
  }

  if (!user?.id || typeof user.id !== 'number') {
    throw new UnauthorizedError('Invalid Telegram user id');
  }

  const raw: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    raw[k] = v;
  }

  return {
    user,
    authDate,
    queryId: params.get('query_id') ?? undefined,
    raw,
  };
}
