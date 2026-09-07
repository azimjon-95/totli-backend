import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectMenu, type Menu, type MenuProduct } from './menu.projection.js';

function product(over: Partial<MenuProduct> = {}): MenuProduct {
  return {
    _id: '1',
    name: { uz: 'Tort', ru: 'Торт' },
    slug: 'tort',
    description: { uz: 'Shirin', ru: 'Сладкий' },
    image: null,
    images: [],
    price: 100,
    variants: [],
    ingredients: [],
    allergens: [],
    isAvailable: true,
    isNew: false,
    isFeatured: false,
    sortOrder: 0,
    ...over,
  };
}

const menu: Menu = {
  categories: [
    {
      _id: 'c1',
      name: { uz: 'Tortlar', ru: 'Торты' },
      slug: 'tortlar',
      description: undefined,
      image: null,
      sortOrder: 0,
      productCount: 2,
      products: [product(), product({ _id: '2', slug: 'tort-2', isAvailable: false })],
    },
    {
      _id: 'c2',
      name: { uz: 'Ichimliklar' },
      slug: 'ichimliklar',
      description: undefined,
      image: null,
      sortOrder: 1,
      productCount: 0,
      products: [],
    },
  ],
  totals: { categories: 2, products: 2 },
  updatedAt: '2026-01-01T00:00:00.000Z',
  generatedAt: '2026-01-01T00:00:00.000Z',
};

test('hides empty categories by default and recounts totals', () => {
  const out = projectMenu(menu, {});
  assert.deepEqual(
    out.categories.map((c) => c.slug),
    ['tortlar']
  );
  assert.deepEqual(out.totals, { categories: 1, products: 2 });
});

test('includeEmpty keeps sections with no products', () => {
  const out = projectMenu(menu, { includeEmpty: true });
  assert.equal(out.categories.length, 2);
});

test('available=true drops sold-out items', () => {
  const out = projectMenu(menu, { available: true });
  assert.equal(out.categories[0]?.products.length, 1);
  assert.equal(out.categories[0]?.productCount, 1);
  assert.deepEqual(out.totals, { categories: 1, products: 1 });
});

test('lang flattens localized fields and falls back to uz', () => {
  const out = projectMenu(menu, { lang: 'ru', includeEmpty: true });
  assert.equal(out.categories[0]?.name, 'Торты');
  assert.equal(out.categories[0]?.products[0]?.name, 'Торт');
  assert.equal(out.categories[0]?.products[0]?.description, 'Сладкий');
  // No ru translation for this one — falls back to uz.
  assert.equal(out.categories[1]?.name, 'Ichimliklar');
});

test('category filter returns just that section, empty or not', () => {
  const out = projectMenu(menu, { category: 'Ichimliklar' });
  assert.equal(out.categories.length, 1);
  assert.equal(out.categories[0]?.slug, 'ichimliklar');
});

test('unknown category slug is a 404', () => {
  assert.throws(() => projectMenu(menu, { category: 'yoq' }), /Category not found/);
});
