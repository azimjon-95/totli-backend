import { env } from '../../config/env.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';

export function mainWebAppKeyboard() {
  const url = env.WEBAPP_URL || 'https://example.com';
  return TelegramService.webAppKeyboard('🎂 Tortlarni ko\'rish', url);
}

export function mainReplyKeyboard() {
  const url = env.WEBAPP_URL || 'https://example.com';
  return TelegramService.replyWebAppKeyboard('🎂 Tortlarni ko\'rish', url);
}
