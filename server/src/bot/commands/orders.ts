import { OrderModel } from '../../modules/orders/order.model.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { formatPrice } from '@totli/shared';

export async function handleOrders(chatId: number) {
  const orders = await OrderModel.find({ status: { $in: ['NEW', 'CONFIRMED', 'PREPARING'] } })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (orders.length === 0) {
    await TelegramService.sendMessage(chatId, 'Hozircha faol buyurtmalar yo\'q.');
    return;
  }

  const lines = ['📦 <b>Faol buyurtmalar</b>', ''];
  for (const o of orders) {
    lines.push(
      `<b>${o.orderNumber}</b> · ${o.status}`,
      `${o.customerName} · ${formatPrice(o.total as number)}`,
      ''
    );
  }

  await TelegramService.sendMessage(chatId, lines.join('\n'));
}
