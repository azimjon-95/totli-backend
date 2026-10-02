import { env } from '../../config/env.js';
import {
  TelegramService,
  type BotMembership,
  type PinResult,
  type ProbeResult,
  type TgMessage,
} from '../../infrastructure/telegram/TelegramService.js';
import { getSetting, setSetting } from '../../modules/notifications/settings.model.js';
import { logger } from '../../infrastructure/logger/index.js';
import { mainWebAppKeyboard } from '../keyboards/main.js';

const SETTING_KEY = 'group_webapp_message_id';

export const WEBAPP_MESSAGE_TEXT = [
  '🍰 <b>TOTLI — Tortlar va shirinliklar</b>',
  '',
  "Yangi tortlarimizni ko'ring va oson buyurtma bering ❤️",
].join('\n');

export interface EnsureResult {
  ok: boolean;
  messageId?: number;
  /** True when a new message was sent (as opposed to re-using the saved one). */
  created?: boolean;
  /** Something worth knowing that is not a failure. */
  note?: string;
  error?: string;
}

export interface WebAppMessageStatus {
  /** Everything is in place: the message exists, is pinned, and the bot can keep it so. */
  ok: boolean;
  groupConfigured: boolean;
  savedMessageId: number | null;
  /** Does the saved message still exist in the group? */
  exists?: boolean;
  /** The message pinned on top of the group; `null` when none, `undefined` when unreadable. */
  pinnedMessageId?: number | null;
  isPinned: boolean;
  botIsAdmin?: boolean;
  botCanPin?: boolean;
  /** Human-readable, in Uzbek — what is wrong. Empty when `ok`. */
  problems: string[];
  /** Worth knowing, but not wrong. */
  notes: string[];
}

export interface WebAppMessageDeps {
  groupId(): string | undefined;
  botConfigured(): boolean;
  getSavedId(): Promise<number | null>;
  saveId(id: number): Promise<void>;
  send(chatId: string, text: string, replyMarkup: unknown): Promise<TgMessage | null>;
  /** Does the message still exist? Must not change anything visible. */
  probe(chatId: string, messageId: number, replyMarkup: unknown): Promise<ProbeResult>;
  getPinnedId(chatId: string): Promise<number | null | undefined>;
  membership(chatId: string): Promise<BotMembership | null>;
  pin(chatId: string, messageId: number): Promise<PinResult>;
  unpin(chatId: string, messageId: number): Promise<boolean>;
  remove(chatId: string, messageId: number): Promise<boolean>;
  keyboard(): unknown;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}

/**
 * Keeps exactly one "open the shop" message, pinned, in the admin group — and
 * can say whether that is currently true.
 *
 * Two rules matter most:
 *
 * 1. A new message is sent only when none is saved, or when Telegram says the
 *    saved one is gone. Anything else going wrong — the bot isn't an admin,
 *    Telegram is rate-limiting, the network blipped — leaves the message alone
 *    and reports it. Re-sending on those would drop a fresh duplicate into the
 *    group on every restart.
 * 2. The group's own pin is respected. If an admin has pinned something else,
 *    that stays on top; only an empty pin slot gets our message back.
 *
 * Calls are serialised, so a startup check, the daily check, a promotion event
 * and `/setup` can't race each other into two messages.
 */
export function createWebAppMessageEnsurer(deps: WebAppMessageDeps) {
  const { log } = deps;
  let queue: Promise<unknown> = Promise.resolve();

  async function run(force: boolean): Promise<EnsureResult> {
    const groupId = deps.groupId();
    if (!groupId) return { ok: false, error: 'TELEGRAM_GROUP_ID not set' };
    if (!deps.botConfigured()) return { ok: false, error: 'Bot token not configured' };

    const savedId = await deps.getSavedId();

    if (savedId && !force) {
      // Re-sending the message's own keyboard doubles as an existence check
      // and heals the button if WEBAPP_URL has changed since it was sent.
      const probe = await deps.probe(groupId, savedId, deps.keyboard());

      if (probe.state === 'unknown') {
        log.warn('Could not check the group WebApp message — leaving it as is', {
          messageId: savedId,
          reason: probe.reason,
          description: probe.description,
        });
        return {
          ok: false,
          messageId: savedId,
          error: `Check failed (${probe.reason}): ${probe.description ?? 'unknown error'}`,
        };
      }

      if (probe.state === 'exists') {
        const pinned = await deps.getPinnedId(groupId);

        if (pinned === savedId) {
          log.info('Group WebApp message present and pinned', { messageId: savedId });
          return { ok: true, messageId: savedId, created: false };
        }
        if (typeof pinned === 'number') {
          // Someone pinned something else; theirs stays on top.
          return {
            ok: true,
            messageId: savedId,
            created: false,
            note: 'Boshqa xabar pinlangan — tegilmadi',
          };
        }

        // Nothing is pinned (or the pin state was unreadable): put ours back.
        const pin = await deps.pin(groupId, savedId);
        if (pin.ok) {
          log.info('Group WebApp message re-pinned', { messageId: savedId });
          return { ok: true, messageId: savedId, created: false };
        }
        log.warn('Group WebApp message exists but could not be pinned', {
          messageId: savedId,
          reason: pin.reason,
          description: pin.description,
        });
        return {
          ok: false,
          messageId: savedId,
          error: `Not pinned (${pin.reason}): ${pin.description ?? 'unknown error'}`,
        };
      }

      log.warn('Group WebApp message was deleted — recreating', { messageId: savedId });
    }

    const message = await deps.send(groupId, WEBAPP_MESSAGE_TEXT, deps.keyboard());
    if (!message) return { ok: false, error: 'Failed to send group message' };

    // Remember the id before anything else can fail: if it were lost, the next
    // run would see "nothing saved" and send a second message.
    await deps.saveId(message.message_id);

    const pin = await deps.pin(groupId, message.message_id);
    log.info('Group WebApp message created', { messageId: message.message_id, pinned: pin.ok });

    // /setup replaces the old message; best effort, never fails the setup.
    if (savedId && savedId !== message.message_id) {
      await deps.unpin(groupId, savedId).catch(() => false);
      await deps.remove(groupId, savedId).catch(() => false);
    }

    if (!pin.ok) {
      return {
        ok: false,
        messageId: message.message_id,
        created: true,
        error: `Message sent but not pinned (${pin.reason}): ${pin.description ?? 'unknown error'}`,
      };
    }
    return { ok: true, messageId: message.message_id, created: true };
  }

  /** Read-only: looks, changes nothing. */
  async function inspect(): Promise<WebAppMessageStatus> {
    const groupId = deps.groupId();
    const base = {
      savedMessageId: null as number | null,
      isPinned: false,
      problems: [] as string[],
      notes: [] as string[],
    };

    if (!groupId) {
      return {
        ...base,
        ok: false,
        groupConfigured: false,
        problems: ["TELEGRAM_GROUP_ID o'rnatilmagan"],
      };
    }
    if (!deps.botConfigured()) {
      return {
        ...base,
        ok: false,
        groupConfigured: true,
        problems: ["TELEGRAM_BOT_TOKEN o'rnatilmagan"],
      };
    }

    const savedMessageId = await deps.getSavedId();
    const problems: string[] = [];
    const notes: string[] = [];
    const status: WebAppMessageStatus = {
      ok: false,
      groupConfigured: true,
      savedMessageId,
      isPinned: false,
      problems,
      notes,
    };

    const membership = await deps.membership(groupId);
    if (!membership) {
      problems.push("Botning guruhdagi holatini bilib bo'lmadi (guruh ID noto'g'ri yoki bot guruhda yo'q)");
    } else {
      status.botIsAdmin = membership.isAdmin;
      status.botCanPin = membership.canPin;
      if (!membership.isAdmin) problems.push('Bot guruhda admin emas');
      else if (!membership.canPin) problems.push('Botda xabarlarni pin qilish huquqi yo‘q');
    }

    if (savedMessageId === null) {
      problems.push('WebApp xabari hali yuborilmagan');
    } else {
      const probe = await deps.probe(groupId, savedMessageId, deps.keyboard());
      status.exists = probe.state === 'exists';

      if (probe.state === 'missing') {
        problems.push("WebApp xabari guruhdan o'chirilgan");
      } else if (probe.state === 'unknown') {
        problems.push(`Xabarni tekshirib bo'lmadi: ${probe.description ?? probe.reason}`);
      }

      const pinned = await deps.getPinnedId(groupId);
      status.pinnedMessageId = pinned;
      status.isPinned = pinned === savedMessageId;
      if (probe.state === 'exists' && !status.isPinned) {
        if (pinned === undefined) {
          problems.push("Guruhdagi pin holatini o'qib bo'lmadi");
        } else if (typeof pinned === 'number') {
          // An admin's own pin is theirs to keep; it only means ours isn't on top.
          notes.push('Guruhda boshqa xabar pinlangan — WebApp xabari ustida emas');
        } else {
          problems.push('WebApp xabari pin qilinmagan');
        }
      }
    }

    status.ok = problems.length === 0;
    return status;
  }

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    ensure: (force = false): Promise<EnsureResult> => enqueue(() => run(force)),
    check: (): Promise<WebAppMessageStatus> => enqueue(inspect),
  };
}

const ensurer = createWebAppMessageEnsurer({
  groupId: () => env.TELEGRAM_GROUP_ID,
  botConfigured: () => TelegramService.isConfigured(),
  getSavedId: () => getSetting<number>(SETTING_KEY),
  saveId: (id) => setSetting(SETTING_KEY, id),
  send: (chatId, text, replyMarkup) =>
    TelegramService.sendMessage(chatId, text, { reply_markup: replyMarkup }),
  probe: (chatId, messageId, markup) => TelegramService.probeMessage(chatId, messageId, markup),
  getPinnedId: (chatId) => TelegramService.getPinnedMessageId(chatId),
  membership: (chatId) => TelegramService.getBotMembership(chatId),
  pin: (chatId, messageId) => TelegramService.tryPinChatMessage(chatId, messageId),
  unpin: (chatId, messageId) => TelegramService.unpinChatMessage(chatId, messageId),
  remove: (chatId, messageId) => TelegramService.deleteMessage(chatId, messageId),
  keyboard: () => mainWebAppKeyboard(),
  log: logger,
});

/**
 * @param force `/setup` only: send a fresh message even if one is saved.
 */
export function ensureWebAppMessage(force = false): Promise<EnsureResult> {
  return ensurer.ensure(force);
}

/** Looks at the group and reports whether the pinned WebApp button is in place. Changes nothing. */
export function checkWebAppMessage(): Promise<WebAppMessageStatus> {
  return ensurer.check();
}

/* ------------------------------------------------------------ daily check */

/** 09:00 in Asia/Tashkent, which is UTC+5 all year (Uzbekistan has no DST). */
export const DAILY_CHECK_UTC_HOUR = 4;

/** Milliseconds from `now` until the next occurrence of `utcHour`:00 UTC. */
export function msUntilNextDailyRun(now: Date, utcHour = DAILY_CHECK_UTC_HOUR): number {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0, 0, 0)
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export interface WatchdogOptions {
  run: () => Promise<unknown>;
  now?: () => Date;
  utcHour?: number;
  onError?: (error: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

/**
 * Runs `run` once a day. It re-arms itself after every run (rather than using
 * a fixed 24h interval) so it doesn't drift away from 09:00, and the timer is
 * unref'd so it never keeps the process alive during shutdown.
 */
export function createDailyWatchdog(opts: WatchdogOptions) {
  const {
    run,
    now = () => new Date(),
    utcHour = DAILY_CHECK_UTC_HOUR,
    onError,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = opts;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  function arm() {
    if (!running) return;
    timer = setTimer(async () => {
      try {
        await run();
      } catch (err) {
        onError?.(err);
      } finally {
        arm();
      }
    }, msUntilNextDailyRun(now(), utcHour));
    timer.unref?.();
  }

  return {
    start() {
      if (running) return;
      running = true;
      arm();
    },
    stop() {
      running = false;
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
}

const watchdog = createDailyWatchdog({
  run: async () => {
    const result = await ensureWebAppMessage(false);
    if (!result.ok) {
      logger.warn('Daily WebApp message check reported a problem', { error: result.error });
    }
  },
  onError: (err) =>
    logger.warn('Daily WebApp message check failed', {
      error: err instanceof Error ? err.message : String(err),
    }),
});

export const startWebAppMessageWatchdog = watchdog.start;
export const stopWebAppMessageWatchdog = watchdog.stop;
