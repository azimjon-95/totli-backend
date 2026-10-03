import { env } from '../../config/env.js';
import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';

export function mainWebAppKeyboard() {
  const url = env.WEBAPP_URL || 'https://example.com';
  return TelegramService.webAppKeyboard('🎂 Tortlarni ko\'rish', url);
}

export function mainReplyKeyboard() {
  const url = env.WEBAPP_URL || 'https://example.com';
  return TelegramService.replyWebAppKeyboard('🎂 Tortlarni ko\'rish', url);
}

export interface GroupLink {
  url: string;
  /**
   * `direct`: tapping opens the Mini App in the group.
   * `via-chat`: tapping opens the bot's private chat, whose /start has the real
   * button — it works, but costs the customer a second tap.
   */
  mode: 'direct' | 'via-chat';
}

/**
 * Where the group's button should point.
 *
 * A `web_app` button cannot be used in a group — Telegram rejects the whole
 * message with BUTTON_TYPE_INVALID — so the group gets a plain `url` button to
 * a Mini App link instead:
 *
 *  1. `WEBAPP_DIRECT_LINK`, if set (e.g. https://t.me/totli_bot/shop for a
 *     Mini App made with /newapp);
 *  2. otherwise the bot's Main Mini App link, when @BotFather has one enabled;
 *  3. otherwise a link into the bot's private chat.
 */
export function resolveGroupLink(opts: {
  explicit?: string;
  username?: string;
  hasMainWebApp: boolean;
}): GroupLink | null {
  const explicit = opts.explicit?.trim();
  if (explicit && /^https:\/\/t\.me\/\S+$/i.test(explicit)) {
    return { url: explicit, mode: 'direct' };
  }

  const username = opts.username?.trim().replace(/^@/, '').trim();
  if (!username) return null;

  return opts.hasMainWebApp
    ? { url: `https://t.me/${username}?startapp`, mode: 'direct' }
    : { url: `https://t.me/${username}?start=shop`, mode: 'via-chat' };
}

/**
 * A plain `url` button. Never `web_app`: Telegram refuses that in a group, and
 * the whole message with it.
 */
export function buildGroupMarkup(link: GroupLink) {
  return { inline_keyboard: [[{ text: "🎂 Tortlarni ko'rish", url: link.url }]] };
}

/** The button for the admin group's pinned message. `null` when the bot's username can't be determined. */
export async function groupWebAppKeyboard(): Promise<{ markup: unknown; mode: GroupLink['mode'] } | null> {
  const info = await TelegramService.getBotInfo();
  const link = resolveGroupLink({
    explicit: env.WEBAPP_DIRECT_LINK,
    username: info?.username ?? env.TELEGRAM_BOT_USERNAME,
    hasMainWebApp: info?.hasMainWebApp ?? false,
  });
  return link ? { markup: buildGroupMarkup(link), mode: link.mode } : null;
}
