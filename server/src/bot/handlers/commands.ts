import { handleStart } from '../commands/start.js';
import { handleOrders } from '../commands/orders.js';
import { handleToday } from '../commands/today.js';
import { handleSetup } from '../commands/setup.js';
import { AdminModel } from '../../modules/admins/admin.model.js';
import { hasPermission } from '../../shared/permissions.js';
import type { AdminRoleType } from '../../modules/admins/admin.model.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';

async function isTelegramAdmin(telegramId: number): Promise<boolean> {
  const admin = await AdminModel.findOne({ telegramId, isActive: true });
  if (!admin) return false;
  return hasPermission(admin.role as AdminRoleType, 'orders:read');
}

export async function handleCommand(
  chatId: number,
  fromId: number | undefined,
  text: string
) {
  const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (cmd === '/start') {
    await handleStart(chatId);
    return;
  }

  if (cmd === '/orders' || cmd === '/today' || cmd === '/setup' || cmd === '/statistics') {
    if (!fromId || !(await isTelegramAdmin(fromId))) {
      await TelegramService.sendMessage(chatId, '⛔ Bu buyruq faqat adminlar uchun.');
      return;
    }
  }

  if (cmd === '/orders') {
    await handleOrders(chatId);
    return;
  }
  if (cmd === '/today' || cmd === '/statistics') {
    await handleToday(chatId);
    return;
  }
  if (cmd === '/setup') {
    await handleSetup(chatId);
    return;
  }
}
