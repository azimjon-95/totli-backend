/**
 * Import this FIRST in any test whose code path reaches `config/env.ts`
 * (directly, or through the logger). ES module imports run in order, so a
 * test that starts with `import '../../test/env.js'` has its environment in
 * place before `env.ts` validates it.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/totli-test-never-connected';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';

export {};
