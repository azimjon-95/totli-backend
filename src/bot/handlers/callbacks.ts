import { handleOrderStatusCallback } from '../callbacks/order-status.js';
import type { TgUpdate } from '../../infrastructure/telegram/TelegramService.js';

export async function handleCallback(update: TgUpdate) {
  const cq = update.callback_query;
  if (!cq?.data || !cq.from) return;

  if (cq.data.startsWith('os:')) {
    await handleOrderStatusCallback({
      callbackId: cq.id,
      telegramUserId: cq.from.id,
      data: cq.data,
      chatId: cq.message?.chat.id,
      messageId: cq.message?.message_id,
      messageText: cq.message?.text,
    });
  }
}
