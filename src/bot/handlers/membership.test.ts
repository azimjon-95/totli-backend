import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleBotMembershipChange } from './membership.js';
import type { EnsureResult } from '../services/groupMessage.js';
import type { TgUpdate } from '../../infrastructure/telegram/TelegramService.js';

const GROUP = '-1002451334889';

const change = (chatId: number | string, from: string, to: string): NonNullable<TgUpdate['my_chat_member']> => ({
  chat: { id: Number(chatId), type: 'supergroup' },
  old_chat_member: { status: from },
  new_chat_member: { status: to },
});

function run(c: ReturnType<typeof change>, opts: { groupId?: string | undefined; result?: EnsureResult } = {}) {
  let ensured = 0;
  const logs: string[] = [];
  const promise = handleBotMembershipChange(c, {
    groupId: 'groupId' in opts ? opts.groupId : GROUP,
    ensure: async () => {
      ensured++;
      return opts.result ?? { ok: true };
    },
    log: { info: (m) => logs.push(`info:${m}`), warn: (m) => logs.push(`warn:${m}`) },
  });
  return { promise, ensured: () => ensured, logs };
}

describe('the bot is promoted in the admin group', () => {
  for (const [from, to] of [
    ['member', 'administrator'],
    ['left', 'administrator'],
    ['restricted', 'administrator'],
    ['member', 'creator'],
  ]) {
    it(`${from} → ${to}: checks the pinned message straight away`, async () => {
      const r = run(change(GROUP, from, to));
      assert.equal(await r.promise, 'ensured');
      assert.equal(r.ensured(), 1);
    });
  }

  it('still reports when that check finds a problem', async () => {
    const r = run(change(GROUP, 'member', 'administrator'), { result: { ok: false, error: 'no rights' } });
    assert.equal(await r.promise, 'ensured');
    assert.ok(r.logs.some((l) => l.startsWith('warn:')));
  });
});

describe('everything else is left alone', () => {
  it('ignores a change of rights that keeps the bot an admin', async () => {
    const r = run(change(GROUP, 'administrator', 'administrator'));
    assert.equal(await r.promise, 'ignored');
    assert.equal(r.ensured(), 0);
  });

  it('ignores being added as a plain member', async () => {
    const r = run(change(GROUP, 'left', 'member'));
    assert.equal(await r.promise, 'ignored');
    assert.equal(r.ensured(), 0);
  });

  it('ignores any other chat', async () => {
    const r = run(change(-100999, 'member', 'administrator'));
    assert.equal(await r.promise, 'ignored');
    assert.equal(r.ensured(), 0);
  });

  it('ignores everything when no group is configured', async () => {
    const r = run(change(GROUP, 'member', 'administrator'), { groupId: undefined });
    assert.equal(await r.promise, 'ignored');
    assert.equal(r.ensured(), 0);
  });
});

describe('the bot is removed from the admin group', () => {
  for (const to of ['kicked', 'left']) {
    it(`warns when it is ${to}, because order alerts will stop`, async () => {
      const r = run(change(GROUP, 'administrator', to));
      assert.equal(await r.promise, 'removed');
      assert.equal(r.ensured(), 0);
      assert.ok(r.logs.some((l) => l.startsWith('warn:')));
    });
  }
});
