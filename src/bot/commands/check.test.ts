import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatWebAppStatus } from './check.js';
import type { WebAppMessageStatus } from '../services/groupMessage.js';

const healthy: WebAppMessageStatus = {
  ok: true,
  groupConfigured: true,
  savedMessageId: 321,
  exists: true,
  pinnedMessageId: 321,
  isPinned: true,
  botIsAdmin: true,
  botCanPin: true,
  problems: [],
  notes: [],
};

describe('formatWebAppStatus', () => {
  it('shows a healthy group with ticks and the message id', () => {
    const text = formatWebAppStatus(healthy);
    assert.match(text, /Bot admin: ✅/);
    assert.match(text, /Pin huquqi: ✅/);
    assert.match(text, /Xabar guruhda: ✅ \(#321\)/);
    assert.match(text, /Pinlangan: ✅/);
    assert.match(text, /Hammasi joyida/);
  });

  it('lists each problem and ends on a failure', () => {
    const text = formatWebAppStatus({
      ...healthy,
      ok: false,
      botIsAdmin: false,
      botCanPin: false,
      isPinned: false,
      problems: ['Bot guruhda admin emas'],
    });
    assert.match(text, /Bot admin: ❌/);
    assert.match(text, /⚠️ Bot guruhda admin emas/);
    assert.match(text, /Muammo bor/);
    assert.doesNotMatch(text, /Hammasi joyida/);
  });

  it('shows notes without calling them problems', () => {
    const text = formatWebAppStatus({ ...healthy, notes: ['Boshqa xabar pinlangan'] });
    assert.match(text, /ℹ️ Boshqa xabar pinlangan/);
    assert.match(text, /Hammasi joyida/);
  });

  it('shows ❔ for what could not be read', () => {
    const text = formatWebAppStatus({ ...healthy, ok: false, botIsAdmin: undefined, botCanPin: undefined });
    assert.match(text, /Bot admin: ❔/);
  });

  it('explains a missing configuration instead of printing empty ticks', () => {
    const text = formatWebAppStatus({
      ok: false,
      groupConfigured: false,
      savedMessageId: null,
      isPinned: false,
      problems: ["TELEGRAM_GROUP_ID o'rnatilmagan"],
      notes: [],
    });
    assert.match(text, /TELEGRAM_GROUP_ID/);
    assert.doesNotMatch(text, /Bot admin/);
  });

  it('cannot be broken by markup in a Telegram error message', () => {
    const text = formatWebAppStatus({
      ...healthy,
      ok: false,
      problems: ['Xabarni tekshirib bo‘lmadi: <b>oops</b> & more'],
    });
    assert.ok(text.includes('&lt;b&gt;oops&lt;/b&gt; &amp; more'));
    assert.ok(!text.includes('<b>oops</b>'));
  });
});
