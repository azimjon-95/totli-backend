import { CategoryRepository } from '../categories/category.repository.js';
import { ProductModel } from '../products/product.model.js';
import { cacheDel, cacheGet, cacheSet } from '../../shared/cache.js';
import type { MenuQuery } from './menu.validation.js';
import {
  projectMenu,
  toLocalized,
  toIso,
  newer,
  toMenuProduct,
  type Menu,
  type MenuCategory,
  type MenuProduct,
} from './menu.projection.js';

/** One Redis key holds the whole menu, so a write invalidates it exactly. */
const MENU_CACHE_KEY = 'menu:public';
const MENU_CACHE_TTL_SEC = 60;

/**
 * The full menu: every active category with its products nested underneath, in
 * the order the admin panel sorts them. Built unfiltered so a single cache
 * entry can serve every language and filter combination.
 */
async function buildMenu(): Promise<Menu> {
  const categories = (await CategoryRepository.findActiveSorted()) as Record<string, unknown>[];
  const categoryIds = categories.map((c) => c._id);

  const products = categoryIds.length
    ? ((await ProductModel.find({ categoryId: { $in: categoryIds } })
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean()) as Record<string, unknown>[])
    : [];

  const byCategory = new Map<string, MenuProduct[]>();
  for (const product of products) {
    const key = String(product.categoryId);
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(toMenuProduct(product));
    else byCategory.set(key, [toMenuProduct(product)]);
  }

  let updatedAt: string | null = null;
  for (const doc of [...categories, ...products]) {
    updatedAt = newer(updatedAt, toIso(doc.updatedAt));
  }

  const menuCategories: MenuCategory[] = categories.map((category) => {
    const items = byCategory.get(String(category._id)) ?? [];
    return {
      _id: String(category._id),
      name: toLocalized(category.name) ?? { uz: '' },
      slug: String(category.slug),
      description: toLocalized(category.description),
      image: typeof category.image === 'string' && category.image ? category.image : null,
      sortOrder: Number(category.sortOrder ?? 0),
      productCount: items.length,
      products: items,
    };
  });

  return {
    categories: menuCategories,
    totals: {
      categories: menuCategories.length,
      products: products.length,
    },
    updatedAt,
    generatedAt: new Date().toISOString(),
  };
}

export type { Menu, MenuCategory, MenuProduct };

export const MenuService = {
  async getPublic(query: MenuQuery = {}): Promise<Menu> {
    const cached = await cacheGet<Menu>(MENU_CACHE_KEY);
    const menu = cached ?? (await buildMenu());
    if (!cached) await cacheSet(MENU_CACHE_KEY, menu, MENU_CACHE_TTL_SEC);
    return projectMenu(menu, query);
  },

  /** Called by the category and product writers so edits show up immediately. */
  async invalidate(): Promise<void> {
    await cacheDel(MENU_CACHE_KEY);
  },
};
