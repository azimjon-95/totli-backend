import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/index.js';
import { fetchLokmagoExport } from '../../infrastructure/lokmago/lokmago.client.js';
import {
  createCatalogStore,
  type CatalogStore,
} from '../../infrastructure/lokmago/lokmago.cache.js';
import {
  buildCatalog,
  normalizeForSearch,
  toSnapshot,
} from '../../infrastructure/lokmago/lokmago.mapper.js';
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogView,
  SourceSnapshot,
} from '../../infrastructure/lokmago/lokmago.types.js';
import { paginateMeta } from '../../shared/pagination.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { organizeCatalog } from './catalog.categories.js';
import { createAssignmentManager, type AssignmentManager } from './catalog.assignments.js';
import { mongoAssignmentStore } from './catalog.assignment.store.js';
import type { CatalogProductQuery } from './catalog.validation.js';

/**
 * Where products and categories come from.
 *
 * Dishes live in LokmaGo and are cached in memory; the only thing stored in
 * MongoDB is an admin's "put this dish in that category" choices. Both are
 * read when the catalog is refreshed — never per request — so a customer's
 * request is answered entirely from memory.
 */

export interface CatalogCategoryDto {
  _id: string;
  slug: string;
  name: { uz: string };
  sortOrder: number;
  isActive: boolean;
  /** Orderable dishes in this category. */
  productCount: number;
  /** Admin view only: every dish, orderable or not. */
  totalCount?: number;
  /** Admin view only: `app` categories are the storefront's own, `extra` came from LokmaGo as is. */
  kind?: 'app' | 'extra';
}

/** What customers get: no admin bookkeeping. */
export type PublicProductDto = Omit<CatalogProduct, 'categorySource' | 'autoCategorySlug'>;
export type AdminProductDto = CatalogProduct;

export interface ProductPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function createDefaultStore(): CatalogStore {
  return createCatalogStore({
    ttlMs: env.LOKMAGO_CACHE_TTL_SEC * 1000,
    log: logger,
    load: async () => {
      const raw = await fetchLokmagoExport({
        url: env.LOKMAGO_CATALOG_URL,
        onRetry: (attempt, error) =>
          logger.warn('Retrying LokmaGo request', { attempt, error: error.message }),
      });
      return toSnapshot(buildCatalog(raw), Date.now());
    },
  });
}

let store: CatalogStore = createDefaultStore();
let assignments: AssignmentManager = createAssignmentManager({
  store: mongoAssignmentStore,
  missLimit: env.CATALOG_MISS_LIMIT,
  log: logger,
});

// "Have we seen this snapshot?" — a new object means a fresh fetch from LokmaGo.
let seenBase: SourceSnapshot | null = null;
let preparing: Promise<void> = Promise.resolve();
let derived: { base: SourceSnapshot; version: number; view: CatalogView } | null = null;

/** Tests swap the upstream and the choices store; production never calls this. */
export function __setCatalogForTests(next: {
  store: CatalogStore;
  assignments: AssignmentManager;
}): void {
  store = next.store;
  assignments = next.assignments;
  seenBase = null;
  preparing = Promise.resolve();
  derived = null;
}

/* ------------------------------------------------------------------- view */

function toView(base: SourceSnapshot, map: ReadonlyMap<string, string>): CatalogView {
  const data = organizeCatalog(base, map);
  return {
    ...data,
    fetchedAt: base.fetchedAt,
    productById: new Map(data.products.map((p) => [p._id, p])),
    categoryBySlug: new Map(data.categories.map((c) => [c.slug, c])),
  };
}

/**
 * The catalog as customers should see it: LokmaGo's dishes, shelved by the
 * admin's choices where there are any.
 */
async function currentView(): Promise<{ view: CatalogView; stale: boolean }> {
  const { snapshot: base, stale } = await store.get();

  if (seenBase !== base) {
    // A snapshot we haven't met is a new successful fetch — one "check" for
    // the 3-miss rule. A stale read returns the same object, so it never counts.
    seenBase = base;
    preparing = assignments.onFreshSnapshot(new Set(base.products.map((p) => p._id)));
  }
  await preparing.catch(() => undefined);

  const { map, version } = assignments.current();
  if (!derived || derived.base !== base || derived.version !== version) {
    derived = { base, version, view: toView(base, map) };
  }
  return { view: derived.view, stale };
}

/* ---------------------------------------------------------------- queries */

function toCategoryDto(c: CatalogCategory, admin: boolean): CatalogCategoryDto {
  return {
    _id: c._id,
    slug: c.slug,
    name: c.name,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: c.availableCount,
    ...(admin ? { totalCount: c.totalCount, kind: c.kind } : {}),
  };
}

function toPublicProduct(p: CatalogProduct): PublicProductDto {
  const { categorySource, autoCategorySlug, ...rest } = p;
  return rest;
}

/** A category is addressable by its slug or by its name. */
function findCategory(view: CatalogView, key: string): CatalogCategory | undefined {
  const bySlug = view.categoryBySlug.get(key);
  if (bySlug) return bySlug;
  const wanted = key.trim().toLowerCase();
  return view.categories.find((c) => c.name.uz.toLowerCase() === wanted);
}

function compareProducts(sort: CatalogProductQuery['sort']) {
  const bySortOrder = (a: CatalogProduct, b: CatalogProduct) => a.sortOrder - b.sortOrder;

  switch (sort) {
    case 'price_asc':
      return (a: CatalogProduct, b: CatalogProduct) => a.price - b.price || bySortOrder(a, b);
    case 'price_desc':
      return (a: CatalogProduct, b: CatalogProduct) => b.price - a.price || bySortOrder(a, b);
    case 'newest':
      // Many dishes share a createdAt (they were imported together); sortOrder keeps ties stable.
      return (a: CatalogProduct, b: CatalogProduct) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || bySortOrder(a, b);
    case 'popular':
      return (a: CatalogProduct, b: CatalogProduct) =>
        Number(b.isFeatured) - Number(a.isFeatured) || bySortOrder(a, b);
    default:
      return bySortOrder;
  }
}

function filterProducts(
  view: CatalogView,
  query: CatalogProductQuery,
  scope: { admin: boolean }
): CatalogProduct[] | null {
  const categoryKey = query.category ?? query.categoryId ?? query.section;

  let slug: string | undefined;
  if (categoryKey) {
    const category = findCategory(view, categoryKey);
    // An unknown category is an empty result, not an error: the storefront
    // may hold a link to a section that has since been renamed.
    if (!category) return null;
    slug = category.slug;
  }

  // Customers see orderable dishes only. Admins see everything unless they ask.
  const availability = query.isAvailable ?? (scope.admin ? undefined : true);
  const needle = query.search ? normalizeForSearch(query.search.trim()) : '';

  return view.products.filter((p) => {
    if (slug && p.categorySlug !== slug) return false;
    if (availability !== undefined && p.isAvailable !== availability) return false;
    if (query.isNew !== undefined && p.isNew !== query.isNew) return false;
    if (query.isFeatured !== undefined && p.isFeatured !== query.isFeatured) return false;
    if (needle) {
      const haystack = normalizeForSearch(
        `${p.name.uz} ${p.description?.uz ?? ''} ${p.section}`
      );
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function paginate<T>(items: T[], page: number, limit: number): ProductPage<T> {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    ...paginateMeta(items.length, page, limit),
  };
}

export const CatalogService = {
  async listCategories(opts: { admin?: boolean } = {}): Promise<CatalogCategoryDto[]> {
    const { view } = await currentView();
    return view.categories
      // A shelf with nothing orderable on it would only be a dead end for customers;
      // admins still see every shelf so they can move dishes onto it.
      .filter((c) => opts.admin || c.availableCount > 0)
      .map((c) => toCategoryDto(c, Boolean(opts.admin)));
  },

  async getCategory(key: string, opts: { admin?: boolean } = {}): Promise<CatalogCategoryDto> {
    const { view } = await currentView();
    const category = findCategory(view, key);
    if (!category || (!opts.admin && category.availableCount === 0)) {
      throw new NotFoundError('Category not found');
    }
    return toCategoryDto(category, Boolean(opts.admin));
  },

  async listProducts(query: CatalogProductQuery): Promise<ProductPage<PublicProductDto>> {
    const { view } = await currentView();
    const matched = filterProducts(view, query, { admin: false });
    if (!matched) return { items: [], ...paginateMeta(0, query.page, query.limit) };

    matched.sort(compareProducts(query.sort));
    const page = paginate(matched, query.page, query.limit);
    return { ...page, items: page.items.map(toPublicProduct) };
  },

  async listProductsAdmin(query: CatalogProductQuery): Promise<ProductPage<AdminProductDto>> {
    const { view } = await currentView();
    const matched = filterProducts(view, query, { admin: true });
    if (!matched) return { items: [], ...paginateMeta(0, query.page, query.limit) };

    matched.sort(compareProducts(query.sort));
    return paginate(matched, query.page, query.limit);
  },

  /**
   * One product, including an unavailable one: a shared link should still
   * open and say "not available" rather than 404. Ordering is refused
   * separately, where the price is resolved.
   */
  async getProduct(id: string): Promise<PublicProductDto> {
    const { view } = await currentView();
    const product = view.productById.get(id);
    if (!product) throw new NotFoundError('Product not found');
    return toPublicProduct(product);
  },

  async getProductAdmin(id: string): Promise<AdminProductDto> {
    const { view } = await currentView();
    const product = view.productById.get(id);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  },

  /**
   * A lookup bound to ONE view. An order resolving several items must see a
   * single consistent catalog, even if the cache expires mid-request.
   */
  async lookup(): Promise<(id: string) => CatalogProduct | undefined> {
    const { view, stale } = await currentView();
    if (stale) {
      logger.warn('Resolving prices from a stale catalog snapshot', {
        ageSec: Math.round((Date.now() - view.fetchedAt) / 1000),
      });
    }
    return (id) => view.productById.get(id);
  },

  /* -------------------------------------------------------- admin choices */

  /**
   * Puts a dish in a category. Choosing the category the dish would be in
   * anyway stores nothing (and drops an earlier override), so the dish keeps
   * following its LokmaGo section.
   */
  async assignCategory(
    productId: string,
    categorySlug: string,
    adminId?: string
  ): Promise<AdminProductDto> {
    const { view } = await currentView();
    const product = view.productById.get(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (!view.categoryBySlug.has(categorySlug)) {
      throw new ValidationError('Unknown category');
    }

    if (categorySlug === product.autoCategorySlug) {
      await assignments.clear(productId);
    } else {
      await assignments.assign({
        productId,
        categorySlug,
        productName: product.name.uz,
        assignedBy: adminId,
      });
    }
    return CatalogService.getProductAdmin(productId);
  },

  /** Back to automatic placement. */
  async clearCategory(productId: string): Promise<AdminProductDto> {
    const { view } = await currentView();
    if (!view.productById.has(productId)) throw new NotFoundError('Product not found');
    await assignments.clear(productId);
    return CatalogService.getProductAdmin(productId);
  },

  async countProducts(): Promise<number> {
    const { view } = await currentView();
    return view.products.length;
  },

  /** Fills the cache at boot so the first customer doesn't pay for the fetch. */
  async warmUp(): Promise<void> {
    await currentView();
  },

  status() {
    return store.status();
  },
};

/**
 * Re-reads LokmaGo on a timer even when nobody is browsing. This is what makes
 * the "3 checks" rule a matter of minutes rather than of customer traffic, and
 * means no customer ever waits on a refresh.
 *
 * The timer is a hair longer than the TTL: at exactly the TTL the cache would
 * often still count as fresh and the tick would do nothing.
 */
export function startCatalogRefresher(): () => void {
  const timer = setInterval(
    () => {
      CatalogService.warmUp().catch(() => undefined);
    },
    env.LOKMAGO_CACHE_TTL_SEC * 1000 + 2_000
  );
  timer.unref();
  return () => clearInterval(timer);
}
