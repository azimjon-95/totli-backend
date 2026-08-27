import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition } from './order.transitions.js';

describe('Order status transitions', () => {
  it('allows NEW → CONFIRMED', () => {
    assert.equal(canTransition('NEW', 'CONFIRMED'), true);
  });
  it('allows NEW → CANCELLED', () => {
    assert.equal(canTransition('NEW', 'CANCELLED'), true);
  });
  it('rejects COMPLETED → PREPARING', () => {
    assert.equal(canTransition('COMPLETED', 'PREPARING'), false);
  });
  it('rejects CANCELLED → NEW', () => {
    assert.equal(canTransition('CANCELLED', 'NEW'), false);
  });
  it('allows DELIVERING → COMPLETED', () => {
    assert.equal(canTransition('DELIVERING', 'COMPLETED'), true);
  });
});
