import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

export type TgCallResult<T> =
  | { ok: true; result: T | null }
  | {
      ok: false;
      code?: number;
      description?: string;
      /** True when no HTTP answer came back at all (DNS, reset, timeout). */
      network?: boolean;
    };

/** Like `callApi`, but keeps the reason a call failed. Does not log. */
async function callApiDetailed<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<TgCallResult<T>> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, description: 'no bot token' };
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
      return { ok: false, code: data.error_code, description: data.description };
    }
    return { ok: true, result: data.result ?? null };
  } catch (err) {
    return {
      ok: false,
      network: true,
      description: err instanceof Error ? err.message : String(err),
    };
  }
}

async function callApi<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<T | null> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn(`Telegram ${method} skipped — no bot token`);
    return null;
  }

  const result = await callApiDetailed<T>(method, body);
  if (!result.ok) {
    logger.error(`Telegram ${method} ${result.network ? 'error' : 'failed'}`, {
      code: result.code,
      description: result.description,
    });
    return null;
  }
  return result.result;
}

export type PinFailure = 'missing' | 'forbidden' | 'transient' | 'unknown';

export type PinResult = { ok: true } | { ok: false; reason: PinFailure; description?: string };

/**
 * Why did pinning fail? Only `missing` means the message is gone and should be
 * re-created. A permissions problem or a network blip says nothing about the
 * message, and re-sending on those would spam the group on every restart.
 */
export function classifyPinFailure(failure: {
  code?: number;
  description?: string;
  network?: boolean;
}): PinFailure {
  const d = (failure.description ?? '').toLowerCase();

  if (failure.network || failure.code === 429 || (failure.code !== undefined && failure.code >= 500)) {
    return 'transient';
  }
  if (d.includes('message to pin not found') || d.includes('message_id_invalid')) {
    return 'missing';
  }
  if (
    failure.code === 403 ||
    d.includes('not enough rights') ||
    d.includes('admin_required') ||
    d.includes('chat not found') ||
    d.includes('not a member') ||
    d.includes('was kicked')
  ) {
    return 'forbidden';
  }
  return 'unknown';
}

export type ProbeResult =
  | { state: 'exists' }
  | { state: 'missing' }
  | { state: 'unknown'; reason: PinFailure; description?: string };

/**
 * Re-sending a message's own keyboard is a way to ask "does it still exist?"
 * without changing anything visible: Telegram answers "message is not
 * modified" for a live message and "message to edit not found" for a deleted one.
 */
export function classifyProbeFailure(failure: {
  code?: number;
  description?: string;
  network?: boolean;
}): ProbeResult {
  const d = (failure.description ?? '').toLowerCase();

  if (d.includes('message is not modified')) return { state: 'exists' };
  if (d.includes('message to edit not found') || d.includes('message_id_invalid')) {
    return { state: 'missing' };
  }
  return {
    state: 'unknown',
    reason: classifyPinFailure(failure),
    description: failure.description,
  };
}

export interface BotInfo {
  id: number;
  username?: string;
  /** The bot has a Main Mini App configured in @BotFather (Bot API 7.8+). */
  hasMainWebApp: boolean;
}

export type SendResult = { ok: true; message: TgMessage } | { ok: false; error: string };

export interface BotMembership {
  isAdmin: boolean;
  canPin: boolean;
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
  my_chat_member?: {
    chat: { id: number; type: string; title?: string };
    from?: { id: number; username?: string };
    old_chat_member: { status: string };
    new_chat_member: { status: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
  };
}

const BOT_INFO_TTL_MS = 10 * 60_000;
let botInfoCache: { at: number; info: BotInfo } | null = null;

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

  /** Like `sendMessage`, but says *why* a send failed (e.g. `BUTTON_TYPE_INVALID`). */
  async trySendMessage(
    chatId: string | number,
    text: string,
    options?: { parse_mode?: string; reply_markup?: unknown }
  ): Promise<SendResult> {
    const result = await callApiDetailed<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode ?? 'HTML',
      reply_markup: options?.reply_markup,
      disable_web_page_preview: true,
    });
    if (result.ok && result.result) return { ok: true, message: result.result };
    return {
      ok: false,
      error: result.ok ? 'empty response' : (result.description ?? 'unknown error'),
    };
  },

  /** Who the bot is. Cached for a few minutes: a username never changes, but enabling the Main Mini App should be noticed without a restart. */
  async getBotInfo(): Promise<BotInfo | null> {
    if (botInfoCache && Date.now() - botInfoCache.at < BOT_INFO_TTL_MS) return botInfoCache.info;

    const me = await callApiDetailed<{ id: number; username?: string; has_main_web_app?: boolean }>(
      'getMe'
    );
    if (!me.ok || !me.result) return botInfoCache?.info ?? null;

    const info: BotInfo = {
      id: me.result.id,
      username: me.result.username,
      hasMainWebApp: me.result.has_main_web_app === true,
    };
    botInfoCache = { at: Date.now(), info };
    return info;
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

  /** Pins silently and reports *why* it failed, so callers can tell a deleted message from a permissions problem. */
  async tryPinChatMessage(chatId: string | number, messageId: number): Promise<PinResult> {
    const result = await callApiDetailed('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: classifyPinFailure(result),
      description: result.description,
    };
  },

  async unpinChatMessage(chatId: string | number, messageId: number): Promise<boolean> {
    const result = await callApiDetailed('unpinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    return result.ok;
  },

  async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
    const result = await callApiDetailed('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    return result.ok;
  },

  /** Does the bot's message still exist? Changes nothing visible. */
  async probeMessage(
    chatId: string | number,
    messageId: number,
    replyMarkup: unknown
  ): Promise<ProbeResult> {
    const result = await callApiDetailed('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
    return result.ok ? { state: 'exists' } : classifyProbeFailure(result);
  },

  /**
   * The message currently pinned on top of the chat: its id, `null` when
   * nothing is pinned, `undefined` when it could not be read.
   */
  async getPinnedMessageId(chatId: string | number): Promise<number | null | undefined> {
    const result = await callApiDetailed<{ pinned_message?: { message_id: number } }>('getChat', {
      chat_id: chatId,
    });
    if (!result.ok) return undefined;
    return result.result?.pinned_message?.message_id ?? null;
  },

  /** What the bot may do in a chat. `null` when Telegram would not say. */
  async getBotMembership(chatId: string | number): Promise<BotMembership | null> {
    const me = await TelegramService.getBotInfo();
    if (!me) return null;

    const member = await callApiDetailed<{ status: string; can_pin_messages?: boolean }>(
      'getChatMember',
      { chat_id: chatId, user_id: me.id }
    );
    if (!member.ok || !member.result) return null;

    const { status, can_pin_messages } = member.result;
    const isCreator = status === 'creator';
    return {
      isAdmin: isCreator || status === 'administrator',
      canPin: isCreator || (status === 'administrator' && can_pin_messages === true),
    };
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
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
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
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
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
