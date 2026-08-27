import { AdminModel } from '../../modules/admins/admin.model.js';
import { OrderService } from '../../modules/orders/order.service.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { orderStatusKeyboard } from '../keyboards/orders.js';
import { hasPermission } from '../../shared/permissions.js';
import type { AdminRoleType } from '../../modules/admins/admin.model.js';
import { logger } from '../../infrastructure/logger/index.js';

const STATUS_LABELS: Record<string, string> = {
  NEW: '🆕 YANGI',
  CONFIRMED: '✅ QABUL QILINDI',
  PREPARING: '👨‍🍳 TAYYORLANMOQDA',
  READY: '📦 TAYYOR',
  DELIVERING: '🚚 YETKAZILMOQDA',
  COMPLETED: '✔️ YAKUNLANDI',
  CANCELLED: '❌ BEKOR',
};

/**
 * callback_data: os:{orderId}:{STATUS}
 */
export async function handleOrderStatusCallback(params: {
  callbackId: string;
  telegramUserId: number;
  data: string;
  chatId?: number;
  messageId?: number;
  messageText?: string;
}) {
  const parts = params.data.split(':');
  if (parts.length !== 3 || parts[0] !== 'os') {
    await TelegramService.answerCallbackQuery(params.callbackId, 'Invalid data');
    return;
  }

  const [, orderId, status] = parts;

  const admin = await AdminModel.findOne({
    telegramId: params.telegramUserId,
    isActive: true,
  });

  if (!admin) {
    await TelegramService.answerCallbackQuery(
      params.callbackId,
      'Sizda ruxsat yo\'q',
      true
    );
    return;
  }

  const role = admin.role as AdminRoleType;
  if (!hasPermission(role, 'orders:status')) {
    await TelegramService.answerCallbackQuery(
      params.callbackId,
      'Order status uchun ruxsat yo\'q',
      true
    );
    return;
  }

  try {
    const order = await OrderService.updateStatus(
      orderId,
      status,
      `telegram:${params.telegramUserId}`,
      `Via Telegram bot by ${admin.username}`
    );

    await TelegramService.answerCallbackQuery(
      params.callbackId,
      `Status: ${STATUS_LABELS[status] || status}`
    );

    if (params.chatId && params.messageId) {
      const orderStatus = String(order.status);
      const label = STATUS_LABELS[orderStatus] || orderStatus;
      const baseText = params.messageText || `Buyurtma ${order.orderNumber}`;
      // Update status line if present, or append
      let newText = baseText;
      if (baseText.includes('Status:')) {
        newText = baseText.replace(/Status:.*$/m, `Status: <b>${label}</b>`);
      } else {
        newText = `${baseText}\n\nStatus: <b>${label}</b>`;
      }

      await TelegramService.editMessageText(params.chatId, params.messageId, newText, {
        reply_markup: orderStatusKeyboard(orderId),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    logger.warn('Order status callback failed', { error: msg });
    await TelegramService.answerCallbackQuery(params.callbackId, msg.slice(0, 180), true);
  }
}
