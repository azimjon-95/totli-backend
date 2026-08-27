import { OrderModel } from '../../modules/orders/order.model.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';

export async function handleToday(chatId: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const statuses = [
    'NEW',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'DELIVERING',
    'COMPLETED',
    'CANCELLED',
  ] as const;

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const n = await OrderModel.countDocuments({
        status,
        createdAt: { $gte: start },
      });
      return { status, n };
    })
  );

  const total = counts.reduce((s, c) => s + c.n, 0);
  const lines = [
    '📊 <b>Bugungi buyurtmalar</b>',
    '',
    `Jami: <b>${total}</b>`,
    ...counts.map((c) => `${c.status}: ${c.n}`),
  ];

  await TelegramService.sendMessage(chatId, lines.join('\n'));
}
