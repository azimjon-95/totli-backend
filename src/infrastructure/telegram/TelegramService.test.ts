import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPinFailure, classifyProbeFailure } from './TelegramService.js';

/** Descriptions are Telegram's own wording. */
describe('classifyPinFailure', () => {
  const cases: Array<[string, { code?: number; description?: string; network?: boolean }, string]> = [
    ['deleted message', { code: 400, description: 'Bad Request: message to pin not found' }, 'missing'],
    ['bad message id', { code: 400, description: 'Bad Request: MESSAGE_ID_INVALID' }, 'missing'],
    ['no pin right', { code: 400, description: 'Bad Request: not enough rights to pin a message' }, 'forbidden'],
    ['admin required', { code: 400, description: 'Bad Request: CHAT_ADMIN_REQUIRED' }, 'forbidden'],
    ['wrong group id', { code: 400, description: 'Bad Request: chat not found' }, 'forbidden'],
    ['kicked', { code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' }, 'forbidden'],
    ['not a member', { code: 403, description: 'Forbidden: bot is not a member of the supergroup chat' }, 'forbidden'],
    ['rate limited', { code: 429, description: 'Too Many Requests: retry after 5' }, 'transient'],
    ['telegram down', { code: 502, description: 'Bad Gateway' }, 'transient'],
    ['no answer at all', { network: true, description: 'fetch failed' }, 'transient'],
    ['something new', { code: 400, description: 'Bad Request: something we have not seen' }, 'unknown'],
  ];

  for (const [label, failure, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      assert.equal(classifyPinFailure(failure), expected);
    });
  }

  it('only "missing" justifies sending a new message', () => {
    const justify = cases.filter(([, f]) => classifyPinFailure(f) === 'missing').length;
    assert.equal(justify, 2);
  });
});

describe('classifyProbeFailure', () => {
  it('reads "message is not modified" as: the message exists', () => {
    assert.deepEqual(
      classifyProbeFailure({
        code: 400,
        description:
          'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
      }),
      { state: 'exists' }
    );
  });

  it('reads "message to edit not found" as: it was deleted', () => {
    assert.deepEqual(
      classifyProbeFailure({ code: 400, description: 'Bad Request: message to edit not found' }),
      { state: 'missing' }
    );
  });

  it('never calls permission or network trouble "deleted"', () => {
    for (const failure of [
      { code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' },
      { code: 400, description: 'Bad Request: chat not found' },
      { code: 429, description: 'Too Many Requests' },
      { network: true, description: 'ECONNRESET' },
    ]) {
      const result = classifyProbeFailure(failure);
      assert.equal(result.state, 'unknown', JSON.stringify(failure));
    }
  });

  it('keeps the reason for an unknown failure', () => {
    const result = classifyProbeFailure({ code: 403, description: 'Forbidden: bot was kicked' });
    assert.equal(result.state === 'unknown' && result.reason, 'forbidden');
  });
});
