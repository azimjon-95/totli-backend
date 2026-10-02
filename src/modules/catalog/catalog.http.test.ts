import '../../test/env.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { createApp } from '../../app.js';
import { __setCatalogForTests } from './catalog.service.js';
import {
  assignProductCategory,
  catalogIsReadOnly,
  clearProductCategory,
} from './catalog.controller.js';
import { createAssignmentManager, createMemoryAssignmentStore } from './catalog.assignments.js';
import { createCatalogStore } from '../../infrastructure/lokmago/lokmago.cache.js';
import { buildCatalog, toSnapshot } from '../../infrastructure/lokmago/lokmago.mapper.js';
import { lokmagoExport } from '../../test/fixtures/lokmago.js';
import { AppError } from '../../shared/errors.js';

const silent = { info() {}, warn() {}, error() {} };
const RAFAELO = '6aa076f3f31bf39e960645e3';

function wire(opts: { failing?: boolean } = {}) {
  let failing = Boolean(opts.failing);
  __setCatalogForTests({
    store: createCatalogStore({
      ttlMs: 60_000,
      log: silent,
      load: async () => {
        if (failing) throw new Error('upstream down');
        return toSnapshot(buildCatalog(lokmagoExport()), Date.now());
      },
    }),
    assignments: createAssignmentManager({
      store: createMemoryAssignmentStore(),
      missLimit: 3,
      log: silent,
    }),
  });
  return { fail: (v: boolean) => void (failing = v) };
}

describe('catalog over HTTP — with MongoDB never connected', () => {
  let server: Server;
  let base: string;

  before(async () => {
    wire();
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  /** A route that touched a Mongoose model would hang on buffering; this turns that into a failure. */
  const get = (path: string) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(2_000) });

  it('really has no database', () => {
    assert.equal(mongoose.connection.readyState, 0);
  });

  it('GET /categories answers from LokmaGo alone', async () => {
    const started = Date.now();
    const res = await get('/api/v1/categories');
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(
      body.data.map((c: { slug: string }) => c.slug),
      ['tugilgan-kun', 'toy', 'unashtiruv', 'bento', 'set', 'bayram', 'bolalar']
    );
    assert.ok(Date.now() - started < 1_000, 'no database wait');
  });

  it('GET /products answers from LokmaGo alone', async () => {
    const res = await get('/api/v1/products?limit=50');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.total, 15);
  });

  it('serves the same routes without the /api prefix', async () => {
    assert.equal((await get('/v1/categories')).status, 200);
    assert.equal((await get('/v1/products')).status, 200);
  });

  it('filters by category slug', async () => {
    const body = await (await get('/api/v1/products?category=toy')).json();
    assert.equal(body.data.total, 3);
  });

  it('GET /products/:id returns the dish, with no admin bookkeeping', async () => {
    const res = await get(`/api/v1/products/${RAFAELO}`);
    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data._id, RAFAELO);
    assert.equal(data.slug, RAFAELO);
    assert.equal(data.categorySlug, 'bayram');
    assert.equal('categorySource' in data, false);
  });

  it('GET /categories/:slug works too', async () => {
    const res = await get('/api/v1/categories/toy');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.productCount, 3);
  });

  it('404s for an unknown dish, a malformed id, and an unknown category', async () => {
    assert.equal((await get('/api/v1/products/does-not-exist')).status, 404);
    assert.equal((await get('/api/v1/products/bad%20id%21')).status, 404);
    assert.equal((await get('/api/v1/categories/nope')).status, 404);
  });

  it('rejects a bad query with 400', async () => {
    assert.equal((await get('/api/v1/products?limit=abc')).status, 400);
    assert.equal((await get('/api/v1/products?sort=random')).status, 400);
  });

  it('refuses anonymous callers on the admin routes — read and write', async () => {
    assert.equal((await get('/api/v1/admin/products')).status, 401);
    for (const [method, path] of [
      ['POST', '/api/v1/admin/products'],
      ['PUT', `/api/v1/admin/products/${RAFAELO}/category`],
      ['DELETE', `/api/v1/admin/products/${RAFAELO}/category`],
      ['POST', '/api/v1/admin/categories'],
    ] as const) {
      const res = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(2_000) });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  it('answers 503, not a crash, when LokmaGo is unreachable and nothing is cached', async () => {
    wire({ failing: true });
    const res = await get('/api/v1/products');
    const body = await res.json();

    assert.equal(res.status, 503);
    assert.equal(body.error.code, 'CATALOG_UNAVAILABLE');
    wire(); // restore for any test that follows
  });
});

/* ------------------------------------------------- admin handlers, directly */
// `requireAdminAuth` needs a database, so the handlers are exercised without it.

function call(handler: (req: Request, res: Response, next: (e?: unknown) => void) => unknown, req: object) {
  return new Promise<{ status: number; body?: any; error?: AppError }>((resolve) => {
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    handler(req as Request, res as unknown as Response, (error) =>
      resolve({ status: (error as AppError | undefined)?.statusCode ?? 200, error: error as AppError })
    );
  });
}

describe('admin catalog handlers', () => {
  it('answers 501 to anything that edits the catalog itself', async () => {
    const out = await call(catalogIsReadOnly, {});
    assert.equal(out.status, 501);
    assert.equal(out.error?.code, 'CATALOG_MANAGED_EXTERNALLY');
  });

  it('PUT category moves a dish and returns it', async () => {
    wire();
    const out = await call(assignProductCategory, {
      params: { id: RAFAELO },
      body: { categorySlug: 'yangi-yil' },
      adminId: 'adm-1',
    });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.categorySlug, 'yangi-yil');
    assert.equal(out.body.data.categorySource, 'manual');
  });

  it('PUT category validates the body, the category and the dish id', async () => {
    wire();
    assert.equal((await call(assignProductCategory, { params: { id: RAFAELO }, body: {} })).status, 400);
    assert.equal(
      (await call(assignProductCategory, { params: { id: RAFAELO }, body: { categorySlug: 'nope' } })).status,
      400
    );
    assert.equal(
      (await call(assignProductCategory, { params: { id: 'bad id!' }, body: { categorySlug: 'toy' } })).status,
      404
    );
    assert.equal(
      (await call(assignProductCategory, { params: { id: 'missing' }, body: { categorySlug: 'toy' } })).status,
      404
    );
  });

  it('DELETE category returns the dish to its automatic shelf', async () => {
    wire();
    await call(assignProductCategory, { params: { id: RAFAELO }, body: { categorySlug: 'yangi-yil' } });
    const out = await call(clearProductCategory, { params: { id: RAFAELO } });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.categorySlug, 'bayram');
    assert.equal(out.body.data.categorySource, 'auto');
  });
});
