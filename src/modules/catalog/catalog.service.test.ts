import '../../test/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogService, __setCatalogForTests } from './catalog.service.js';
import {
  createAssignmentManager,
  createMemoryAssignmentStore,
  type AssignmentRecord,
} from './catalog.assignments.js';
import { catalogProductQuerySchema, type CatalogProductQuery } from './catalog.validation.js';
import { createCatalogStore } from '../../infrastructure/lokmago/lokmago.cache.js';
import { buildCatalog, toSnapshot } from '../../infrastructure/lokmago/lokmago.mapper.js';
import { dish, lokmagoExport } from '../../test/fixtures/lokmago.js';
import { AppError } from '../../shared/errors.js';

const silent = { info() {}, warn() {}, error() {} };

const TOY_1 = '6aa076f3f31bf39e960645de';
const RAFAELO = '6aa076f3f31bf39e960645e3';
const LAVASH = '6ab58c31c2bb19796a296344';

/** Fresh service wiring per test: a scripted upstream, a clock, an in-memory choices table. */
function harness(opts: { dishes?: unknown[]; initial?: AssignmentRecord[]; missLimit?: number } = {}) {
  let time = 1_000_000;
  let dishes: unknown[] | undefined = opts.dishes;
  let failing = false;
  let loads = 0;

  const store = createCatalogStore({
    ttlMs: 60_000,
    failureBackoffMs: 0,
    now: () => time,
    log: silent,
    load: async () => {
      loads++;
      if (failing) throw new Error('upstream down');
      return toSnapshot(buildCatalog(lokmagoExport({ dishes })), time);
    },
  });
  const memory = createMemoryAssignmentStore(opts.initial);
  const assignments = createAssignmentManager({
    store: memory,
    missLimit: opts.missLimit ?? 3,
    log: silent,
  });

  __setCatalogForTests({ store, assignments });

  return {
    memory,
    loads: () => loads,
    /** Expire the cache so the next read is a fresh fetch. */
    expire: () => void (time += 61_000),
    setDishes: (next: unknown[]) => void (dishes = next),
    fail: (v: boolean) => void (failing = v),
  };
}

const query = (q: Record<string, string> = {}): CatalogProductQuery =>
  catalogProductQuerySchema.parse(q);

describe('CatalogService — categories', () => {
  beforeEach(() => void harness());

  it('shows customers only categories with something to order', async () => {
    const slugs = (await CatalogService.listCategories()).map((c) => c.slug);
    assert.deepEqual(slugs, ['tugilgan-kun', 'toy', 'unashtiruv', 'bento', 'set', 'bayram', 'bolalar']);
    assert.ok(!slugs.includes('milliy-taom'), 'all of its dishes are unavailable');
    assert.ok(!slugs.includes('yangi-yil'), 'empty storefront category stays hidden');
  });

  it('shows admins every category, empty ones included, with their kind and totals', async () => {
    const all = await CatalogService.listCategories({ admin: true });
    const yangiYil = all.find((c) => c.slug === 'yangi-yil')!;
    assert.equal(yangiYil.kind, 'app');
    assert.equal(yangiYil.totalCount, 0);

    const milliy = all.find((c) => c.slug === 'milliy-taom')!;
    assert.equal(milliy.kind, 'extra');
    assert.equal(milliy.totalCount, 3);
    assert.equal(milliy.productCount, 0);
  });

  it('keeps admin-only fields out of the public view', async () => {
    const [first] = await CatalogService.listCategories();
    assert.equal('kind' in first, false);
    assert.equal('totalCount' in first, false);
  });

  it('finds a category by slug or by name', async () => {
    assert.equal((await CatalogService.getCategory('toy')).slug, 'toy');
    assert.equal((await CatalogService.getCategory("to'y tortlari")).slug, 'toy');
  });

  it('404s for an unknown category, and for one with nothing orderable (public only)', async () => {
    await assert.rejects(CatalogService.getCategory('nope'), (e: AppError) => e.statusCode === 404);
    await assert.rejects(CatalogService.getCategory('milliy-taom'), (e: AppError) => e.statusCode === 404);
    assert.equal((await CatalogService.getCategory('milliy-taom', { admin: true })).slug, 'milliy-taom');
  });
});

describe('CatalogService — products', () => {
  beforeEach(() => void harness());

  it('lists only orderable dishes to customers', async () => {
    const page = await CatalogService.listProducts(query({ limit: '50' }));
    assert.equal(page.total, 15);
    assert.ok(page.items.every((p) => p.isAvailable));
  });

  it('lets admins see everything', async () => {
    const page = await CatalogService.listProductsAdmin(query({ limit: '50' }));
    assert.equal(page.total, 18);
  });

  it('can be asked for the unavailable ones', async () => {
    const page = await CatalogService.listProducts(query({ isAvailable: 'false', limit: '50' }));
    assert.deepEqual(
      page.items.map((p) => p.name.uz).sort(),
      ['Asarti', 'Lavash', 'Pasta']
    );
  });

  it('filters by category slug, name, or either query parameter', async () => {
    const variants: Array<Record<string, string>> = [
      { category: 'toy' },
      { categoryId: 'toy' },
      { section: "To'y tortlari" },
    ];
    for (const q of variants) {
      const page = await CatalogService.listProducts(query(q));
      assert.equal(page.total, 3, JSON.stringify(q));
      assert.ok(page.items.every((p) => p.categorySlug === 'toy'));
    }
  });

  it('returns an empty page, not an error, for an unknown category', async () => {
    const page = await CatalogService.listProducts(query({ category: 'renamed-long-ago' }));
    assert.deepEqual(page.items, []);
    assert.equal(page.total, 0);
  });

  it('searches names and descriptions, ignoring case and Uzbek apostrophes', async () => {
    const names = async (search: string) =>
      (await CatalogService.listProducts(query({ search }))).items.map((p) => p._id);

    assert.deepEqual(await names('hashamat'), ['6aa076f3f31bf39e960645dc']);
    assert.deepEqual(await names('KELIN-KUYOV'), ['6aa076f3f31bf39e960645da']);
    // "toy" finds To‘y-named dishes; the section name counts too, so it finds the whole shelf.
    assert.equal((await names('toy')).length, 3);
    assert.deepEqual(await names('nothing like this'), []);
  });

  it('sorts by price, ascending and descending', async () => {
    const asc = (await CatalogService.listProducts(query({ sort: 'price_asc', limit: '50' }))).items;
    const desc = (await CatalogService.listProducts(query({ sort: 'price_desc', limit: '50' }))).items;

    assert.equal(asc[0].price, 105000);
    assert.equal(desc[0].price, 850000);
    assert.ok(asc.every((p, i) => i === 0 || asc[i - 1].price <= p.price), 'ascending');
    assert.ok(desc.every((p, i) => i === 0 || desc[i - 1].price >= p.price), 'descending');
  });

  it('puts the most recently created first for "newest", ties in catalog order', async () => {
    const items = (await CatalogService.listProducts(query({ sort: 'newest', limit: '3' }))).items;
    assert.equal(items[0].name.uz, 'Детский торт', 'the only dish created later than the rest');
    assert.equal(items[1].sortOrder < items[2].sortOrder, true);
  });

  it('puts hits first for "popular"', async () => {
    const items = (await CatalogService.listProducts(query({ sort: 'popular' }))).items;
    assert.equal(items[0].name.uz, 'Yashil «Elegant»');
  });

  it('paginates and reports the totals', async () => {
    const p1 = await CatalogService.listProducts(query({ page: '1', limit: '6' }));
    const p3 = await CatalogService.listProducts(query({ page: '3', limit: '6' }));
    assert.equal(p1.items.length, 6);
    assert.equal(p1.totalPages, 3);
    assert.equal(p3.items.length, 3);
    assert.equal(p3.page, 3);
    assert.deepEqual(
      (await CatalogService.listProducts(query({ page: '9', limit: '6' }))).items,
      []
    );
  });

  it('opens an unavailable dish — a shared link should say so, not 404', async () => {
    const lavash = await CatalogService.getProduct(LAVASH);
    assert.equal(lavash.isAvailable, false);
    assert.equal(lavash.variants.length, 2);
  });

  it('404s for a dish that does not exist', async () => {
    await assert.rejects(CatalogService.getProduct('nope'), (e: AppError) => e.statusCode === 404);
  });

  it('keeps admin bookkeeping out of what customers get', async () => {
    const pub = await CatalogService.getProduct(RAFAELO);
    assert.equal('categorySource' in pub, false);
    assert.equal('autoCategorySlug' in pub, false);

    const listed = (await CatalogService.listProducts(query())).items[0];
    assert.equal('categorySource' in listed, false);

    const admin = await CatalogService.getProductAdmin(RAFAELO);
    assert.equal(admin.categorySource, 'auto');
  });

  it('resolves several dishes against one consistent catalog', async () => {
    const find = await CatalogService.lookup();
    assert.equal(find(RAFAELO)?.price, 150000);
    assert.equal(find('nope'), undefined);
  });
});

describe('CatalogService — admin shelving', () => {
  it('moves a dish and shows it on both the public and admin side at once', async () => {
    harness();
    const moved = await CatalogService.assignCategory(RAFAELO, 'yangi-yil', 'admin-1');
    assert.equal(moved.categorySlug, 'yangi-yil');
    assert.equal(moved.categorySource, 'manual');

    const shelf = await CatalogService.listProducts(query({ category: 'yangi-yil' }));
    assert.deepEqual(shelf.items.map((p) => p._id), [RAFAELO]);
    assert.ok(
      (await CatalogService.listCategories()).some((c) => c.slug === 'yangi-yil'),
      'a previously empty category appears once it has a dish'
    );
  });

  it('survives a catalog refresh', async () => {
    const h = harness();
    await CatalogService.assignCategory(RAFAELO, 'yangi-yil');
    h.expire();
    const after = await CatalogService.getProductAdmin(RAFAELO);
    assert.equal(after.categorySlug, 'yangi-yil');
    assert.equal(h.loads(), 2, 'it did refetch');
  });

  it('is stored for the next run, together with the dish name', async () => {
    const h = harness();
    await CatalogService.assignCategory(RAFAELO, 'bento', 'adm-7');
    assert.deepEqual(h.memory.snapshot(), [
      {
        productId: RAFAELO,
        categorySlug: 'bento',
        productName: 'Rafaelo «Romantik»',
        assignedBy: 'adm-7',
        missCount: 0,
      },
    ]);
  });

  it('applies choices that were stored earlier', async () => {
    harness({ initial: [{ productId: RAFAELO, categorySlug: 'set', missCount: 0 }] });
    assert.equal((await CatalogService.getProductAdmin(RAFAELO)).categorySlug, 'set');
  });

  it('choosing the automatic category stores nothing and drops an earlier override', async () => {
    const h = harness();
    await CatalogService.assignCategory(RAFAELO, 'yangi-yil');
    assert.equal(h.memory.snapshot().length, 1);

    const back = await CatalogService.assignCategory(RAFAELO, 'bayram');
    assert.equal(back.categorySource, 'auto');
    assert.deepEqual(h.memory.snapshot(), []);
  });

  it('clearCategory puts a dish back to automatic', async () => {
    harness();
    await CatalogService.assignCategory(RAFAELO, 'yangi-yil');
    const cleared = await CatalogService.clearCategory(RAFAELO);
    assert.equal(cleared.categorySlug, 'bayram');
    assert.equal(cleared.categorySource, 'auto');
  });

  it('rejects an unknown category and an unknown dish', async () => {
    harness();
    await assert.rejects(
      CatalogService.assignCategory(RAFAELO, 'made-up'),
      (e: AppError) => e.statusCode === 400
    );
    await assert.rejects(
      CatalogService.assignCategory('nope', 'toy'),
      (e: AppError) => e.statusCode === 404
    );
    await assert.rejects(CatalogService.clearCategory('nope'), (e: AppError) => e.statusCode === 404);
  });

  it('can shelve an unavailable dish — it just stays hidden from customers', async () => {
    harness();
    const moved = await CatalogService.assignCategory(LAVASH, 'set');
    assert.equal(moved.categorySlug, 'set');
    const shelf = await CatalogService.listProducts(query({ category: 'set' }));
    assert.ok(!shelf.items.some((p) => p._id === LAVASH));
  });
});

describe('CatalogService — a dish that stops coming from LokmaGo', () => {
  const allDishes = () => lokmagoExport().dishes as Array<{ _id: string }>;

  it('loses its category after 3 fresh checks, and not before', async () => {
    const h = harness({
      initial: [{ productId: TOY_1, categorySlug: 'bento', missCount: 0 }],
    });
    const gone = allDishes().filter((d) => d._id !== TOY_1);

    await CatalogService.warmUp(); // check 1: dish present → nothing to count
    h.setDishes(gone);

    h.expire();
    await CatalogService.warmUp(); // check 2: first miss
    assert.equal(h.memory.snapshot()[0].missCount, 1);
    h.expire();
    await CatalogService.warmUp(); // check 3: second miss
    assert.equal(h.memory.snapshot()[0].missCount, 2);
    h.expire();
    await CatalogService.warmUp(); // check 4: third miss → removed
    assert.deepEqual(h.memory.snapshot(), []);
  });

  it('is not counted while LokmaGo is down — an outage cannot wipe choices', async () => {
    const h = harness({
      initial: [{ productId: TOY_1, categorySlug: 'bento', missCount: 0 }],
    });
    await CatalogService.warmUp();
    h.fail(true);

    for (let i = 0; i < 6; i++) {
      h.expire();
      await CatalogService.warmUp(); // stale reads
    }

    assert.equal(h.memory.snapshot()[0].missCount, 0);
    assert.equal((await CatalogService.getProductAdmin(TOY_1)).categorySlug, 'bento', 'still served');
  });

  it('is not counted on repeated reads of the same snapshot', async () => {
    const h = harness({
      initial: [{ productId: TOY_1, categorySlug: 'bento', missCount: 0 }],
    });
    h.setDishes(allDishes().filter((d) => d._id !== TOY_1));

    await CatalogService.warmUp();
    for (let i = 0; i < 25; i++) await CatalogService.listProducts(query());

    assert.equal(h.memory.snapshot()[0].missCount, 1, 'one fetch, one check');
  });
});

describe('CatalogService — when LokmaGo cannot be reached', () => {
  it('serves the last good catalog, with admin choices intact', async () => {
    const h = harness();
    await CatalogService.assignCategory(RAFAELO, 'yangi-yil');
    h.fail(true);
    h.expire();

    const page = await CatalogService.listProducts(query({ category: 'yangi-yil' }));
    assert.equal(page.total, 1);
  });

  it('answers 503 when there has never been a catalog', async () => {
    const h = harness();
    h.fail(true);
    await assert.rejects(CatalogService.listCategories(), (e: AppError) => e.statusCode === 503);
  });
});

describe('CatalogService — odd menus', () => {
  it('handles an empty menu', async () => {
    harness({ dishes: [] });
    assert.deepEqual(await CatalogService.listCategories(), []);
    assert.equal((await CatalogService.listProducts(query())).total, 0);
    assert.equal(await CatalogService.countProducts(), 0);
  });

  it('puts a dish with no section on a "Boshqa" shelf the admin can empty', async () => {
    harness({ dishes: [{ ...dish('x1', 'tmp', 'Section-less', 10), section: undefined }] });
    const boshqa = (await CatalogService.listCategories()).find((c) => c.slug === 'boshqa');
    assert.equal(boshqa?.productCount, 1);

    await CatalogService.assignCategory('x1', 'toy');
    assert.ok(!(await CatalogService.listCategories()).some((c) => c.slug === 'boshqa'));
  });
});
