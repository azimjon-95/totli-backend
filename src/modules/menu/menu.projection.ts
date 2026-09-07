import { NotFoundError } from '../../shared/errors.js';
import type { MenuQuery } from './menu.validation.js';

/**
 * Pure shaping helpers for the menu payload. Kept free of database, cache and
 * config imports so they can be unit tested without a running environment.
 */
type Localized = { uz: string; ru?: string; en?: string };

export interface MenuProduct {
  _id: string;
  name: Localized | string;
  slug: string;
  description?: Localized | string;
  image: string | null;
  images: string[];
  price: number;
  compareAtPrice?: number;
  weight?: number;
  servings?: number;
  variants: unknown[];
  ingredients: string[];
  allergens: string[];
  isAvailable: boolean;
  isNew: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

export interface MenuCategory {
  _id: string;
  name: Localized | string;
  slug: string;
  description?: Localized | string;
  image: string | null;
  sortOrder: number;
  productCount: number;
  products: MenuProduct[];
}

export interface Menu {
  categories: MenuCategory[];
  totals: { categories: number; products: number };
  /** Newest `updatedAt` in the payload — lets clients skip an unchanged menu. */
  updatedAt: string | null;
  generatedAt: string;
}

export function toLocalized(value: unknown): Localized | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const uz = typeof raw.uz === 'string' ? raw.uz : '';
  const ru = typeof raw.ru === 'string' && raw.ru ? raw.ru : undefined;
  const en = typeof raw.en === 'string' && raw.en ? raw.en : undefined;
  if (!uz && !ru && !en) return undefined;
  return { uz, ru, en };
}

export function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export function newer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function toMenuProduct(doc: Record<string, unknown>): MenuProduct {
  const images = Array.isArray(doc.images) ? doc.images.map(String) : [];
  return {
    _id: String(doc._id),
    name: toLocalized(doc.name) ?? { uz: '' },
    slug: String(doc.slug),
    description: toLocalized(doc.description),
    image: images[0] ?? null,
    images,
    price: Number(doc.price ?? 0),
    compareAtPrice: typeof doc.compareAtPrice === 'number' ? doc.compareAtPrice : undefined,
    weight: typeof doc.weight === 'number' ? doc.weight : undefined,
    servings: typeof doc.servings === 'number' ? doc.servings : undefined,
    variants: Array.isArray(doc.variants) ? doc.variants : [],
    ingredients: Array.isArray(doc.ingredients) ? doc.ingredients.map(String) : [],
    allergens: Array.isArray(doc.allergens) ? doc.allergens.map(String) : [],
    isAvailable: doc.isAvailable !== false,
    isNew: doc.isNew === true,
    isFeatured: doc.isFeatured === true,
    sortOrder: Number(doc.sortOrder ?? 0),
  };
}

function pickLang(value: Localized | string | undefined, lang: 'uz' | 'ru' | 'en') {
  if (value === undefined || typeof value === 'string') return value;
  return value[lang] || value.uz || '';
}

/** Applies the request's language and filters to the cached, unfiltered menu. */
export function projectMenu(menu: Menu, query: MenuQuery): Menu {
  const { lang, category, available, includeEmpty } = query;

  let categories = menu.categories;
  if (category) {
    const slug = category.toLowerCase();
    categories = categories.filter((c) => c.slug === slug);
    if (categories.length === 0) throw new NotFoundError('Category not found');
  }

  categories = categories.map((c) => {
    const products = available ? c.products.filter((p) => p.isAvailable) : c.products;
    return {
      ...c,
      name: lang ? (pickLang(c.name, lang) as string) : c.name,
      description: lang ? pickLang(c.description, lang) : c.description,
      productCount: products.length,
      products: lang
        ? products.map((p) => ({
            ...p,
            name: pickLang(p.name, lang) as string,
            description: pickLang(p.description, lang),
          }))
        : products,
    };
  });

  // An empty section reads as a broken menu, so hide it unless asked for.
  if (!includeEmpty && !category) {
    categories = categories.filter((c) => c.products.length > 0);
  }

  return {
    ...menu,
    categories,
    totals: {
      categories: categories.length,
      products: categories.reduce((sum, c) => sum + c.products.length, 0),
    },
  };
}

