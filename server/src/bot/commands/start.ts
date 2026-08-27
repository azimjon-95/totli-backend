import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import { mainWebAppKeyboard, mainReplyKeyboard } from '../keyboards/main.js';

export async function handleStart(chatId: number) {
  const text = [
    '🍰 <b>Assalomu alaykum!</b>',
    '',
    '<b>TOTLI</b> — mazali tortlar va shirinliklar.',
    'Tortlarni ko\'ring va buyurtmangizni bir necha bosishda bering.',
  ].join('\n');

  await TelegramService.sendMessage(chatId, text, {
    reply_markup: mainWebAppKeyboard(),
  });

  // Also set persistent reply keyboard
  await TelegramService.sendMessage(chatId, 'Pastdagi tugma orqali katalogni oching 👇', {
    reply_markup: mainReplyKeyboard(),
  });
}
