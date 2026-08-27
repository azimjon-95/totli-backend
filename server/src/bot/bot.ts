import { env, isProd } from '../config/env.js';
import { TelegramService, type TgUpdate } from '../infrastructure/telegram/TelegramService.js';
import { logger } from '../infrastructure/logger/index.js';
import { handleCommand } from './handlers/commands.js';
import { handleCallback } from './handlers/callbacks.js';
import { ensureWebAppMessage } from './services/groupMessage.js';

let polling = false;
let offset = 0;
let stopped = false;

async function processUpdate(update: TgUpdate) {
  try {
    if (update.callback_query) {
      await handleCallback(update);
      return;
    }
    const msg = update.message;
    if (msg?.text?.startsWith('/') && msg.chat) {
      await handleCommand(msg.chat.id, msg.from?.id, msg.text);
    }
  } catch (err) {
    logger.error('Bot update processing error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function pollLoop() {
  polling = true;
  logger.info('Telegram bot long-polling started');

  while (!stopped) {
    try {
      const updates = await TelegramService.getUpdates(offset, 25);
      for (const u of updates) {
        offset = u.update_id + 1;
        await processUpdate(u);
      }
    } catch (err) {
      logger.error('Bot poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  polling = false;
  logger.info('Telegram bot polling stopped');
}

export async function startBot(): Promise<void> {
  if (!TelegramService.isConfigured()) {
    logger.warn('Telegram bot not started — TELEGRAM_BOT_TOKEN missing');
    return;
  }

  stopped = false;

  // Prefer long polling in development; production can use webhook later
  await TelegramService.deleteWebhook();

  // Ensure group pinned message (non-blocking)
  ensureWebAppMessage(false).catch((err) => {
    logger.warn('ensureWebAppMessage failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (isProd && process.env.TELEGRAM_WEBHOOK_URL) {
    const ok = await TelegramService.setWebhook(process.env.TELEGRAM_WEBHOOK_URL);
    logger.info('Telegram webhook mode', { ok });
    return;
  }

  // Long polling (don't await — runs in background)
  void pollLoop();
}

export async function stopBot(): Promise<void> {
  stopped = true;
  // Wait briefly for loop to exit
  for (let i = 0; i < 30 && polling; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
}
