import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDailyWatchdog,
  createWebAppMessageEnsurer,
  msUntilNextDailyRun,
  WEBAPP_MESSAGE_TEXT,
  type WebAppMessageDeps,
} from './groupMessage.js';
import type { BotMembership, PinResult, ProbeResult } from '../../infrastructure/telegram/TelegramService.js';

const GROUP = '-1002451334889';
const KEYBOARD = { inline_keyboard: [[{ text: 'open', web_app: { url: 'https://x' } }]] };

/** A tiny fake Telegram group, with a call log. */
function world(init: Partial<{
  saved: number | null;
  existing: number[];
  pinned: number | null | undefined;
  membership: BotMembership | null;
  probe: ProbeResult;
  pin: PinResult;
  group: string | undefined;
  token: boolean;
  sendFails: boolean;
}> = {}) {
  const w = {
    saved: init.saved ?? null,
    messages: new Set<number>(init.existing ?? (init.saved ? [init.saved] : [])),
    pinned: 'pinned' in init ? init.pinned : (null as number | null | undefined),
    membership: 'membership' in init ? init.membership! : ({ isAdmin: true, canPin: true } as BotMembership | null),
    probeOverride: init.probe,
    pinOverride: init.pin,
    nextId: 500,
    calls: [] as string[],
    probedWith: [] as unknown[],
  };

  const deps: WebAppMessageDeps = {
    groupId: () => ('group' in init ? init.group : GROUP),
    botConfigured: () => init.token ?? true,
    getSavedId: async () => w.saved,
    saveId: async (id) => {
      w.calls.push('save');
      w.saved = id;
    },
    send: async () => {
      w.calls.push('send');
      if (init.sendFails) return null;
      const id = w.nextId++;
      w.messages.add(id);
      return { message_id: id, chat: { id: -1 } };
    },
    probe: async (_chat, id, markup) => {
      w.calls.push('probe');
      w.probedWith.push(markup);
      if (w.probeOverride) return w.probeOverride;
      return w.messages.has(id) ? { state: 'exists' } : { state: 'missing' };
    },
    getPinnedId: async () => w.pinned,
    membership: async () => w.membership,
    pin: async (_chat, id) => {
      w.calls.push('pin');
      if (w.pinOverride) return w.pinOverride;
      if (!w.messages.has(id)) return { ok: false, reason: 'missing' };
      w.pinned = id;
      return { ok: true };
    },
    unpin: async () => {
      w.calls.push('unpin');
      return true;
    },
    remove: async (_chat, id) => {
      w.calls.push('remove');
      w.messages.delete(id);
      return true;
    },
    keyboard: () => KEYBOARD,
    log: { info() {}, warn() {} },
  };

  const ensurer = createWebAppMessageEnsurer(deps);
  const sent = () => w.calls.filter((c) => c === 'send').length;
  return { w, ensurer, sent };
}

const mutating = ['send', 'save', 'pin', 'unpin', 'remove'];

describe('ensure — the first run', () => {
  it('sends the message once, remembers it, then pins it — in that order', async () => {
    const { w, ensurer } = world();
    const result = await ensurer.ensure();

    assert.deepEqual(result, { ok: true, messageId: 500, created: true });
    assert.deepEqual(w.calls, ['send', 'save', 'pin']);
    assert.equal(w.saved, 500);
    assert.equal(w.pinned, 500);
  });

  it('reports a failure to send without saving anything', async () => {
    const { w, ensurer } = world({ sendFails: true });
    const result = await ensurer.ensure();
    assert.equal(result.ok, false);
    assert.equal(w.saved, null);
  });

  it('does nothing without a group id or a bot token', async () => {
    for (const init of [{ group: undefined }, { token: false }]) {
      const { w, ensurer } = world(init);
      assert.equal((await ensurer.ensure()).ok, false);
      assert.deepEqual(w.calls, []);
    }
  });
});

describe('ensure — restarts must not add messages', () => {
  it('leaves a present, pinned message completely alone', async () => {
    const { w, ensurer } = world({ saved: 300, pinned: 300 });
    const result = await ensurer.ensure();

    assert.deepEqual(result, { ok: true, messageId: 300, created: false });
    assert.equal(w.calls.filter((c) => mutating.includes(c)).length, 0, 'no sends, pins or deletes');
  });

  it('puts the pin back when nothing is pinned, without sending anything', async () => {
    const { w, ensurer, sent } = world({ saved: 300, pinned: null });
    const result = await ensurer.ensure();

    assert.equal(result.ok, true);
    assert.equal(sent(), 0);
    assert.equal(w.pinned, 300);
  });

  it("respects an admin's own pin: leaves it on top and says so", async () => {
    const { w, ensurer, sent } = world({ saved: 300, pinned: 999 });
    const result = await ensurer.ensure();

    assert.equal(result.ok, true);
    assert.ok(result.note);
    assert.equal(sent(), 0);
    assert.equal(w.calls.includes('pin'), false);
    assert.equal(w.pinned, 999);
  });

  it('re-sends its own keyboard when probing, so a changed WEBAPP_URL heals the button', async () => {
    const { w, ensurer } = world({ saved: 300, pinned: 300 });
    await ensurer.ensure();
    assert.deepEqual(w.probedWith, [KEYBOARD]);
  });

  it('does not add a second message when the bot cannot pin — however many restarts', async () => {
    const forbidden: PinResult = { ok: false, reason: 'forbidden', description: 'not enough rights' };
    const { w, ensurer, sent } = world({ pin: forbidden });

    const first = await ensurer.ensure(); // sends, cannot pin
    assert.equal(first.ok, false);
    assert.equal(first.created, true);

    for (let restart = 0; restart < 5; restart++) {
      const again = await ensurer.ensure();
      assert.equal(again.ok, false);
      assert.equal(again.created, undefined);
    }
    assert.equal(sent(), 1, 'exactly one message in the group');
    assert.equal(w.saved, 500);
  });

  it('does not re-send when the check itself fails for a reason that is not "deleted"', async () => {
    for (const reason of ['forbidden', 'transient', 'unknown'] as const) {
      const { sent, ensurer } = world({
        saved: 300,
        probe: { state: 'unknown', reason, description: 'boom' },
      });
      const result = await ensurer.ensure();
      assert.equal(result.ok, false, reason);
      assert.match(result.error ?? '', new RegExp(reason));
      assert.equal(sent(), 0, reason);
    }
  });

  it('serialises simultaneous calls so they cannot each send a message', async () => {
    const { sent, ensurer } = world();
    const results = await Promise.all(Array.from({ length: 6 }, () => ensurer.ensure()));

    assert.equal(sent(), 1);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results.filter((r) => r.created).length, 1);
  });
});

describe('ensure — the message was deleted', () => {
  it('sends and pins a replacement and remembers its id', async () => {
    const { w, ensurer } = world({ saved: 300, existing: [] });
    const result = await ensurer.ensure();

    assert.deepEqual(result, { ok: true, messageId: 500, created: true });
    assert.equal(w.saved, 500);
    assert.equal(w.pinned, 500);
  });

  it('then goes quiet again on the next run', async () => {
    const { ensurer, sent } = world({ saved: 300, existing: [] });
    await ensurer.ensure();
    await ensurer.ensure();
    await ensurer.ensure();
    assert.equal(sent(), 1);
  });
});

describe('ensure — /setup (force)', () => {
  it('replaces the message even though one exists, and tidies the old one away', async () => {
    const { w, ensurer } = world({ saved: 300, pinned: 300 });
    const result = await ensurer.ensure(true);

    assert.deepEqual(result, { ok: true, messageId: 500, created: true });
    assert.equal(w.saved, 500);
    assert.ok(w.calls.includes('unpin'));
    assert.ok(w.calls.includes('remove'));
    assert.equal(w.messages.has(300), false);
  });

  it('has nothing to tidy when no message was saved', async () => {
    const { w, ensurer } = world();
    await ensurer.ensure(true);
    assert.equal(w.calls.includes('unpin'), false);
    assert.equal(w.calls.includes('remove'), false);
  });
});

describe('check — reports without touching anything', () => {
  const ALL_OK = { saved: 300, pinned: 300 };

  it('says everything is fine when it is', async () => {
    const { w, ensurer } = world(ALL_OK);
    const status = await ensurer.check();

    assert.equal(status.ok, true);
    assert.deepEqual(status.problems, []);
    assert.equal(status.exists, true);
    assert.equal(status.isPinned, true);
    assert.equal(status.botIsAdmin, true);
    assert.equal(status.botCanPin, true);
    assert.equal(w.calls.filter((c) => mutating.includes(c)).length, 0);
  });

  it('flags a bot that is not an admin', async () => {
    const { ensurer } = world({ ...ALL_OK, membership: { isAdmin: false, canPin: false } });
    const status = await ensurer.check();
    assert.equal(status.ok, false);
    assert.equal(status.botIsAdmin, false);
    assert.ok(status.problems.some((p) => p.includes('admin emas')));
  });

  it('flags an admin without the pin right', async () => {
    const { ensurer } = world({ ...ALL_OK, membership: { isAdmin: true, canPin: false } });
    const status = await ensurer.check();
    assert.ok(status.problems.some((p) => p.includes('pin qilish huquqi')));
  });

  it('flags a message that was never sent', async () => {
    const { ensurer } = world();
    const status = await ensurer.check();
    assert.equal(status.ok, false);
    assert.equal(status.savedMessageId, null);
    assert.ok(status.problems.some((p) => p.includes('hali yuborilmagan')));
  });

  it('flags a message deleted from the group', async () => {
    const { ensurer } = world({ saved: 300, existing: [], pinned: null });
    const status = await ensurer.check();
    assert.equal(status.exists, false);
    assert.ok(status.problems.some((p) => p.includes("o'chirilgan")));
  });

  it('flags a message that exists but is not pinned', async () => {
    const { ensurer } = world({ saved: 300, pinned: null });
    const status = await ensurer.check();
    assert.equal(status.exists, true);
    assert.equal(status.isPinned, false);
    assert.ok(status.problems.some((p) => p.includes('pin qilinmagan')));
  });

  it("treats another message on top of the pins as a note, not a problem", async () => {
    const { ensurer } = world({ saved: 300, pinned: 999 });
    const status = await ensurer.check();
    assert.equal(status.ok, true);
    assert.equal(status.notes.length, 1);
  });

  it('flags an unreadable group (wrong id, or the bot is not in it)', async () => {
    const { ensurer } = world({ ...ALL_OK, membership: null });
    const status = await ensurer.check();
    assert.equal(status.ok, false);
    assert.equal(status.botIsAdmin, undefined);
    assert.ok(status.problems.length > 0);
  });

  it('flags an unreadable pin state without calling it "not pinned"', async () => {
    const { ensurer } = world({ saved: 300, pinned: undefined });
    const status = await ensurer.check();
    assert.ok(status.problems.some((p) => p.includes("o'qib bo'lmadi")));
    assert.ok(!status.problems.some((p) => p.includes('pin qilinmagan')));
  });

  it('explains a missing configuration', async () => {
    const noGroup = await world({ group: undefined }).ensurer.check();
    assert.equal(noGroup.groupConfigured, false);
    assert.equal(noGroup.ok, false);

    const noToken = await world({ token: false }).ensurer.check();
    assert.equal(noToken.ok, false);
    assert.ok(noToken.problems[0].includes('TOKEN'));
  });
});

describe('the message itself', () => {
  it('invites people to open the shop', () => {
    assert.match(WEBAPP_MESSAGE_TEXT, /TOTLI/);
    assert.match(WEBAPP_MESSAGE_TEXT, /buyurtma bering/);
  });
});

describe('msUntilNextDailyRun — 09:00 Tashkent is 04:00 UTC', () => {
  const HOUR = 3_600_000;
  const at = (iso: string) => new Date(iso);

  it('counts to later the same day', () => {
    assert.equal(msUntilNextDailyRun(at('2026-10-02T03:00:00Z')), 1 * HOUR);
  });
  it('rolls to tomorrow once the time has passed', () => {
    assert.equal(msUntilNextDailyRun(at('2026-10-02T10:00:00Z')), 18 * HOUR);
  });
  it('waits a full day when it is exactly the time', () => {
    assert.equal(msUntilNextDailyRun(at('2026-10-02T04:00:00Z')), 24 * HOUR);
  });
  it('crosses month and year ends', () => {
    assert.equal(msUntilNextDailyRun(at('2026-10-31T10:00:00Z')), 18 * HOUR);
    assert.equal(msUntilNextDailyRun(at('2026-12-31T23:00:00Z')), 5 * HOUR);
  });
  it('accepts another hour', () => {
    assert.equal(msUntilNextDailyRun(at('2026-10-02T00:00:00Z'), 2), 2 * HOUR);
  });
});

describe('daily watchdog', () => {
  function harness() {
    const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    let runs = 0;
    const errors: unknown[] = [];
    let failNext = false;

    const dog = createDailyWatchdog({
      run: async () => {
        runs++;
        if (failNext) throw new Error('boom');
      },
      now: () => new Date('2026-10-02T03:00:00Z'),
      onError: (e) => errors.push(e),
      setTimer: ((fn: () => void, ms: number) => {
        const t = { fn, ms, cleared: false, unref() {} };
        timers.push(t);
        return t;
      }) as never,
      clearTimer: ((t: { cleared: boolean }) => void (t.cleared = true)) as never,
    });
    return { dog, timers, runs: () => runs, errors, failNext: () => void (failNext = true) };
  }

  it('arms one timer for the next 09:00 when started', () => {
    const h = harness();
    h.dog.start();
    assert.equal(h.timers.length, 1);
    assert.equal(h.timers[0].ms, 3_600_000);
  });

  it('is not armed twice by a second start()', () => {
    const h = harness();
    h.dog.start();
    h.dog.start();
    assert.equal(h.timers.length, 1);
  });

  it('runs when the timer fires, then re-arms for the next day', async () => {
    const h = harness();
    h.dog.start();
    h.timers[0].fn();
    await new Promise((r) => setImmediate(r));

    assert.equal(h.runs(), 1);
    assert.equal(h.timers.length, 2);
  });

  it('keeps going after a run throws', async () => {
    const h = harness();
    h.failNext();
    h.dog.start();
    h.timers[0].fn();
    await new Promise((r) => setImmediate(r));

    assert.equal(h.errors.length, 1);
    assert.equal(h.timers.length, 2, 'still re-armed');
  });

  it('stop() cancels the timer and does not re-arm', async () => {
    const h = harness();
    h.dog.start();
    h.dog.stop();
    assert.equal(h.timers[0].cleared, true);

    h.timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.timers.length, 1, 'no new timer after stop');
  });
});
