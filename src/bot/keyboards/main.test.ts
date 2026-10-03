import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupMarkup, resolveGroupLink } from './main.js';

describe('resolveGroupLink', () => {
  it('uses an explicit direct link when it is a t.me address', () => {
    assert.deepEqual(
      resolveGroupLink({ explicit: 'https://t.me/totli_bot/shop', username: 'totli_bot', hasMainWebApp: false }),
      { url: 'https://t.me/totli_bot/shop', mode: 'direct' }
    );
  });

  it('ignores an explicit link that is not an https t.me address', () => {
    for (const explicit of ['http://t.me/x/y', 'https://evil.example/x', 'totli_bot/shop', '', '   ']) {
      const link = resolveGroupLink({ explicit, username: 'totli_bot', hasMainWebApp: true });
      assert.equal(link?.url, 'https://t.me/totli_bot?startapp', JSON.stringify(explicit));
    }
  });

  it("uses the bot's Main Mini App link when @BotFather has one", () => {
    assert.deepEqual(resolveGroupLink({ username: 'totli_bot', hasMainWebApp: true }), {
      url: 'https://t.me/totli_bot?startapp',
      mode: 'direct',
    });
  });

  it("falls back to the bot's private chat when there is no Main Mini App", () => {
    assert.deepEqual(resolveGroupLink({ username: 'totli_bot', hasMainWebApp: false }), {
      url: 'https://t.me/totli_bot?start=shop',
      mode: 'via-chat',
    });
  });

  it('accepts a username written with @ or stray spaces', () => {
    assert.equal(resolveGroupLink({ username: ' @totli_bot ', hasMainWebApp: true })?.url, 'https://t.me/totli_bot?startapp');
  });

  it('has nothing to link to without a username or an explicit link', () => {
    assert.equal(resolveGroupLink({ hasMainWebApp: true }), null);
    assert.equal(resolveGroupLink({ username: '  ', hasMainWebApp: true }), null);
  });
});

describe('buildGroupMarkup', () => {
  it('is a plain url button — Telegram rejects web_app buttons in groups (BUTTON_TYPE_INVALID)', () => {
    const markup = buildGroupMarkup({ url: 'https://t.me/totli_bot?startapp', mode: 'direct' });
    const button = markup.inline_keyboard[0][0];

    assert.equal(button.url, 'https://t.me/totli_bot?startapp');
    assert.equal('web_app' in button, false);
    assert.match(button.text, /Tortlarni/);
  });
});
