import { env } from '../../config/env.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { getSetting, setSetting } from '../../modules/notifications/settings.model.js';
import { logger } from '../../infrastructure/logger/index.js';
import { mainWebAppKeyboard } from '../keyboards/main.js';

const SETTING_KEY = 'group_webapp_message_id';

/**
 * Ensure a single pinned WebApp message exists in the configured group.
 * Does not spam duplicates on restart.
 */
export async function ensureWebAppMessage(force = false): Promise<{
  ok: boolean;
  messageId?: number;
  error?: string;
}> {
  const groupId = env.TELEGRAM_GROUP_ID;
  if (!groupId) {
    return { ok: false, error: 'TELEGRAM_GROUP_ID not set' };
  }
  if (!TelegramService.isConfigured()) {
    return { ok: false, error: 'Bot token not configured' };
  }

  const existingId = await getSetting<number>(SETTING_KEY);

  if (existingId && !force) {
    // Try re-pin; if message was deleted, recreate
    const pinned = await TelegramService.pinChatMessage(groupId, existingId);
    if (pinned) {
      logger.info('Group WebApp message already exists', { messageId: existingId });
      return { ok: true, messageId: existingId };
    }
    logger.warn('Existing pinned message missing — recreating');
  }

  const text = [
    '🍰 <b>TOTLI — Tortlar va shirinliklar</b>',
    '',
    'Yangi tortlarimizni ko\'ring va oson buyurtma bering ❤️',
  ].join('\n');

  const msg = await TelegramService.sendMessage(groupId, text, {
    reply_markup: mainWebAppKeyboard(),
  });

  if (!msg) {
    return { ok: false, error: 'Failed to send group message' };
  }

  await TelegramService.pinChatMessage(groupId, msg.message_id);
  await setSetting(SETTING_KEY, msg.message_id);

  logger.info('Group WebApp message created and pinned', { messageId: msg.message_id });
  return { ok: true, messageId: msg.message_id };
}
