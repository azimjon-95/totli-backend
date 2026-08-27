import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function callApi<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<T | null> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn(`Telegram ${method} skipped — no bot token`);
    return null;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }
    );
    const data = (await res.json()) as TgResponse<T>;
    if (!data.ok) {
      logger.error(`Telegram ${method} failed`, {
        code: data.error_code,
        description: data.description,
      });
      if (data.error_code === 429) {
        // Rate limited — caller may retry
      }
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    logger.error(`Telegram ${method} error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
  };
}

export const TelegramService = {
  isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN);
  },

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: {
      parse_mode?: string;
      reply_markup?: unknown;
      disable_web_page_preview?: boolean;
    }
  ): Promise<TgMessage | null> {
    return callApi<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode ?? 'HTML',
      reply_markup: options?.reply_markup,
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
    });
  },

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: { parse_mode?: string; reply_markup?: unknown }
  ): Promise<boolean> {
    const result = await callApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode ?? 'HTML',
      reply_markup: options?.reply_markup,
    });
    return result !== null;
  },

  async pinChatMessage(chatId: string | number, messageId: number): Promise<boolean> {
    const result = await callApi('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
    return result !== null;
  },

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<boolean> {
    const result = await callApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
    return result !== null;
  },

  async getUpdates(offset?: number, timeout = 25): Promise<TgUpdate[]> {
    const result = await callApi<TgUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    });
    return result ?? [];
  },

  async deleteWebhook(): Promise<void> {
    await callApi('deleteWebhook', { drop_pending_updates: false });
  },

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    const result = await callApi('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    });
    return result !== null;
  },

  webAppKeyboard(text: string, webAppUrl: string) {
    return {
      inline_keyboard: [[{ text, web_app: { url: webAppUrl } }]],
    };
  },

  replyWebAppKeyboard(text: string, webAppUrl: string) {
    return {
      keyboard: [[{ text, web_app: { url: webAppUrl } }]],
      resize_keyboard: true,
    };
  },
};
