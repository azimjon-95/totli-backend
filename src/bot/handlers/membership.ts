import type { TgUpdate } from '../../infrastructure/telegram/TelegramService.js';
import type { EnsureResult } from '../services/groupMessage.js';

type Change = NonNullable<TgUpdate['my_chat_member']>;

const isAdminStatus = (status: string) => status === 'administrator' || status === 'creator';
const isGoneStatus = (status: string) => status === 'left' || status === 'kicked';

export interface MembershipDeps {
  groupId: string | undefined;
  ensure: () => Promise<EnsureResult>;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}

/**
 * The bot's own status in a chat changed. When it becomes an admin of the
 * configured group — the moment it gains the right to pin — the pinned WebApp
 * message is checked straight away, instead of waiting for the next daily run.
 *
 * Returns what it did, for tests and logs.
 */
export async function handleBotMembershipChange(
  change: Change,
  deps: MembershipDeps
): Promise<'ensured' | 'removed' | 'ignored'> {
  if (!deps.groupId || String(change.chat.id) !== deps.groupId) return 'ignored';

  const from = change.old_chat_member.status;
  const to = change.new_chat_member.status;

  if (isAdminStatus(to) && !isAdminStatus(from)) {
    deps.log.info('Bot became an admin of the group — checking the pinned WebApp message', {
      previously: from,
    });
    const result = await deps.ensure();
    if (!result.ok) deps.log.warn('Check after promotion reported a problem', { error: result.error });
    return 'ensured';
  }

  if (isGoneStatus(to)) {
    deps.log.warn('Bot was removed from the admin group — order alerts will not be delivered', {
      status: to,
    });
    return 'removed';
  }

  return 'ignored';
}
