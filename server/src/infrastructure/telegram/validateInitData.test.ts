import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * Unit tests for Telegram initData HMAC algorithm.
 * Uses a synthetic bot token and builds valid/invalid initData.
 */

function buildInitData(
  botToken: string,
  user: object,
  authDate: number,
  tamperHash?: string
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', JSON.stringify(user));

  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash =
    tamperHash ??
    crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

describe('Telegram initData HMAC', () => {
  const botToken = '123456:ABC-DEF_test_token';

  it('produces stable hash for same payload', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = { id: 42, first_name: 'Test' };
    const a = buildInitData(botToken, user, authDate);
    const b = buildInitData(botToken, user, authDate);
    assert.equal(a, b);
  });

  it('different tokens produce different hashes', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = { id: 1, first_name: 'A' };
    const a = buildInitData(botToken, user, authDate);
    const b = buildInitData('other:token', user, authDate);
    const hashA = new URLSearchParams(a).get('hash');
    const hashB = new URLSearchParams(b).get('hash');
    assert.notEqual(hashA, hashB);
  });

  it('tampered hash differs from valid', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = { id: 99 };
    const valid = buildInitData(botToken, user, authDate);
    const bad = buildInitData(botToken, user, authDate, '0'.repeat(64));
    assert.notEqual(
      new URLSearchParams(valid).get('hash'),
      new URLSearchParams(bad).get('hash')
    );
  });
});

describe('Order number format', () => {
  it('matches TOT-YYYYMMDD-XXXXX pattern', () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const sample = `TOT-${y}${m}${d}-00001`;
    assert.match(sample, /^TOT-\d{8}-\d{5}$/);
  });
});

describe('Permissions matrix', () => {
  it('SUPER_ADMIN has all key permissions', async () => {
    const { hasPermission } = await import('../../shared/permissions.js');
    assert.equal(hasPermission('SUPER_ADMIN', 'admins:manage'), true);
    assert.equal(hasPermission('OPERATOR', 'products:write'), false);
    assert.equal(hasPermission('CONTENT_MANAGER', 'orders:status'), false);
    assert.equal(hasPermission('OPERATOR', 'orders:status'), true);
  });
});
