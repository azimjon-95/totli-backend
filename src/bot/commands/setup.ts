import { ensureWebAppMessage } from '../services/groupMessage.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';

export async function handleSetup(chatId: number) {
  const result = await ensureWebAppMessage(true);
  if (result.ok) {
    await TelegramService.sendMessage(
      chatId,
      `✅ Group WebApp xabari tayyor.\nMessage ID: ${result.messageId}`
    );
  } else {
    await TelegramService.sendMessage(
      chatId,
      `❌ Setup muvaffaqiyatsiz: ${result.error || 'unknown'}`
    );
  }
}
