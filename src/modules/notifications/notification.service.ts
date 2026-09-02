import { NotificationModel } from './notification.model.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { OrderModel } from '../orders/order.model.js';
import { orderStatusKeyboard } from '../../bot/keyboards/orders.js';
import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/index.js';
import { formatPrice } from '../../shared/format.js';
import { onAppEvent } from '../../shared/events.js';

const STATUS_CUSTOMER_MSG: Record<string, string> = {
  CONFIRMED: '✅ Buyurtmangiz qabul qilindi!',
  PREPARING: '👨‍🍳 Buyurtmangiz tayyorlanmoqda.',
  READY: '🎂 Buyurtmangiz tayyor!',
  DELIVERING: '🚚 Buyurtmangiz yo\'lda!',
  COMPLETED: '❤️ Buyurtmangiz muvaffaqiyatli yakunlandi.\nTOTLI\'ni tanlaganingiz uchun rahmat!',
  CANCELLED: '❌ Buyurtmangiz bekor qilindi.',
};

function formatAdminOrderMessage(order: Record<string, unknown>): string {
  const items = (order.items as Array<{
    name: string;
    quantity: number;
    price: number;
    cakeMessage?: string;
  }>) || [];

  const itemsBlock = items
    .map(
      (i, idx) =>
        `${idx + 1}. <b>${i.name}</b>\n   ${i.quantity} × ${formatPrice(i.price)} = ${formatPrice(i.price * i.quantity)}` +
        (i.cakeMessage ? `\n   ✍️ Yozuv: «${i.cakeMessage}»` : '')
    )
    .join('\n');

  const addr =
    order.deliveryAddress && typeof order.deliveryAddress === 'object'
      ? (order.deliveryAddress as { street?: string }).street
      : typeof order.deliveryAddress === 'string'
        ? order.deliveryAddress
        : '';

  const uname = order.telegramUsername
    ? String(order.telegramUsername).replace(/^@/, '')
    : '';
  const tgLine = uname
    ? `📱 Telegram: @${uname}`
    : order.telegramId
      ? `🆔 Telegram ID: <code>${order.telegramId}</code>`
      : null;

  return [
    '🎂 <b>YANGI BUYURTMA — TOTLI</b>',
    `━━━━━━━━━━━━━━━━`,
    `🧾 № <b>${order.orderNumber}</b>`,
    '',
    '👤 <b>MIJOZ</b>',
    `Ism: ${order.customerName || '—'}`,
    tgLine,
    `📞 Telefon: <code>${order.customerPhone || '—'}</code>`,
    '',
    '🍰 <b>TORT / MAHSULOT</b>',
    itemsBlock,
    '',
    order.cakeMessage ? `✏️ Tort yozuvi: «${order.cakeMessage}»` : null,
    order.deliveryDate ? `📅 Sana: ${order.deliveryDate}` : null,
    order.deliveryTime ? `🕐 Vaqt: ${order.deliveryTime}` : null,
    order.deliveryType === 'pickup' ? '🏪 Olib ketish' : null,
    addr ? `📍 Manzil: ${addr}` : null,
    order.comment ? `💬 Izoh: ${order.comment}` : null,
    '',
    `💰 <b>JAMI: ${formatPrice(order.total as number)}</b>`,
    '',
    '💳 To\'lovni admin o\'zi kelishadi',
    'Status: <b>🆕 YANGI</b>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendWithIdempotency(params: {
  idempotencyKey: string;
  notificationType: string;
  orderId?: string;
  orderNumber?: string;
  recipient: string;
  send: () => Promise<boolean>;
}) {
  const existing = await NotificationModel.findOne({
    idempotencyKey: params.idempotencyKey,
  });
  if (existing?.status === 'sent') {
    return true;
  }

  let doc = existing;
  if (!doc) {
    doc = await NotificationModel.create({
      notificationType: params.notificationType,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      recipient: params.recipient,
      status: 'pending',
      attempts: 0,
      idempotencyKey: params.idempotencyKey,
    });
  }

  doc.attempts += 1;
  try {
    const ok = await params.send();
    if (ok) {
      doc.status = 'sent';
      doc.sentAt = new Date();
      doc.lastError = undefined;
      await doc.save();
      return true;
    }
    doc.status = 'failed';
    doc.lastError = 'Telegram API returned null';
    doc.nextRetryAt = new Date(Date.now() + Math.min(doc.attempts * 60_000, 15 * 60_000));
    await doc.save();
    return false;
  } catch (err) {
    doc.status = 'failed';
    doc.lastError = err instanceof Error ? err.message : String(err);
    doc.nextRetryAt = new Date(Date.now() + Math.min(doc.attempts * 60_000, 15 * 60_000));
    await doc.save();
    return false;
  }
}

export const NotificationService = {
  async notifyAdminNewOrder(orderId: string) {
    const order = await OrderModel.findById(orderId).lean();
    if (!order) return;

    // The admin group is the primary destination — several admins can see
    // and act on an order there. ADMIN_CHAT_ID (a single person's chat) is
    // only a fallback for setups that haven't moved to a group yet.
    const chatId = env.TELEGRAM_GROUP_ID || env.ADMIN_CHAT_ID;
    if (!chatId) {
      logger.warn('TELEGRAM_GROUP_ID / ADMIN_CHAT_ID not set — skip admin notification');
      return;
    }

    const text = formatAdminOrderMessage(order as Record<string, unknown>);

    await sendWithIdempotency({
      idempotencyKey: `admin_order_created:${orderId}`,
      notificationType: 'ADMIN_ORDER_CREATED',
      orderId,
      orderNumber: order.orderNumber,
      recipient: String(chatId),
      send: async () => {
        const msg = await TelegramService.sendMessage(chatId, text, {
          reply_markup: orderStatusKeyboard(orderId),
        });
        return Boolean(msg);
      },
    });
  },

  async notifyCustomerStatus(orderId: string, status: string) {
    const order = await OrderModel.findById(orderId).lean();
    if (!order) return;

    const template = STATUS_CUSTOMER_MSG[status];
    if (!template) return;

    const telegramId = order.telegramId as number;
    if (!telegramId) return;

    const text = `${template}\n№ <b>${order.orderNumber}</b>`;

    await sendWithIdempotency({
      idempotencyKey: `customer_status:${orderId}:${status}`,
      notificationType: `CUSTOMER_STATUS_${status}`,
      orderId,
      orderNumber: order.orderNumber,
      recipient: String(telegramId),
      send: async () => {
        const msg = await TelegramService.sendMessage(telegramId, text);
        return Boolean(msg);
      },
    });
  },

  registerEventHandlers() {
    onAppEvent(async (event) => {
      try {
        if (event.type === 'ORDER_CREATED') {
          await NotificationService.notifyAdminNewOrder(event.orderId);
        }
        if (event.type === 'ORDER_STATUS_CHANGED') {
          await NotificationService.notifyCustomerStatus(event.orderId, event.to);
        }
      } catch (err) {
        logger.error('Notification event handler error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  },
};
