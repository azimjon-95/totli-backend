import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePlainText } from './sanitize.js';

describe('sanitizePlainText', () => {
  it('strips HTML tags', () => {
    assert.equal(sanitizePlainText('<script>alert(1)</script>Hi'), 'alert(1)Hi');
  });
  it('truncates to max length', () => {
    assert.equal(sanitizePlainText('a'.repeat(200), 150).length, 150);
  });
  it('normalizes whitespace', () => {
    assert.equal(sanitizePlainText('  hello   world  '), 'hello world');
  });
});
