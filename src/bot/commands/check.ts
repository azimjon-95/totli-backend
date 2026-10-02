import { TelegramService } from '../../infrastructure/telegram/TelegramService.js';
import {
  checkWebAppMessage,
  ensureWebAppMessage,
  type WebAppMessageStatus,
} from '../services/groupMessage.js';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mark = (v: boolean | undefined) => (v === undefined ? '❔' : v ? '✅' : '❌');

/** The chat-ready report for a status. Pure, so its wording is tested. */
export function formatWebAppStatus(s: WebAppMessageStatus): string {
  const lines = ['🔎 <b>Guruhdagi WebApp tugmasi</b>', ''];

  if (!s.groupConfigured) {
    lines.push(...s.problems.map((p) => `❌ ${escapeHtml(p)}`));
    return lines.join('\n');
  }

  lines.push(
    `Bot admin: ${mark(s.botIsAdmin)}`,
    `Pin huquqi: ${mark(s.botCanPin)}`,
    `Xabar guruhda: ${mark(s.exists)}${s.savedMessageId ? ` (#${s.savedMessageId})` : ''}`,
    `Pinlangan: ${mark(s.isPinned)}`
  );

  if (s.problems.length) {
    lines.push('', ...s.problems.map((p) => `⚠️ ${escapeHtml(p)}`));
  }
  if (s.notes.length) {
    lines.push('', ...s.notes.map((n) => `ℹ️ ${escapeHtml(n)}`));
  }
  lines.push('', s.ok ? '✅ Hammasi joyida.' : '❌ Muammo bor.');
  return lines.join('\n');
}

/**
 * `/check` — admins only. Reports the state of the pinned WebApp message and,
 * when something is off but the bot is able to fix it, fixes it and reports again.
 */
export async function handleCheck(chatId: number) {
  const before = await checkWebAppMessage();
  let text = formatWebAppStatus(before);

  // Fixing needs the right to pin; without it there is nothing the bot can do but say so.
  if (!before.ok && before.groupConfigured && before.botCanPin) {
    const fix = await ensureWebAppMessage(false);
    const after = await checkWebAppMessage();

    text +=
      '\n\n🔧 <b>Avtomatik tuzatish</b>: ' +
      (fix.ok ? '✅ bajarildi' : `❌ ${escapeHtml(fix.error ?? 'xatolik')}`) +
      '\n\n' +
      formatWebAppStatus(after);
  }

  await TelegramService.sendMessage(chatId, text);
}
