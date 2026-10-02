import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalog,
  LokmagoPayloadError,
  normalizeForSearch,
  parseWeightGrams,
} from './lokmago.mapper.js';
import { dish, lokmagoExport } from '../../test/fixtures/lokmago.js';

describe('buildCatalog — products', () => {
  const catalog = buildCatalog(lokmagoExport());
  const byId = (id: string) => catalog.products.find((p) => p._id === id)!;

  it('maps the core fields', () => {
    const p = byId('6aa076f3f31bf39e960645e3');
    assert.equal(p.name.uz, 'Rafaelo «Romantik»');
    assert.equal(p.description?.uz, 'Rafaelo «Romantik» — tavsif');
    assert.equal(p.price, 150000);
    assert.equal(p.section, 'Bayram tortlari');
    assert.equal(p.isAvailable, true);
    assert.equal(p.prepMinutes, 30);
  });

  it('exposes the dish id as both _id and slug', () => {
    const p = byId('6aa076f3f31bf39e960645e3');
    assert.equal(p.slug, p._id);
  });

  it('keeps the dish id as an opaque string', () => {
    assert.equal(typeof byId('6ab58c31c2bb19796a296344')._id, 'string');
  });

  it('numbers products by their position in the export', () => {
    assert.deepEqual(
      catalog.products.slice(0, 3).map((p) => p.sortOrder),
      [0, 1, 2]
    );
  });

  it('falls back to imageUrl when images is empty or missing', () => {
    const { products } = buildCatalog(
      lokmagoExport({
        dishes: [
          dish('i1', 'S', 'Only imageUrl', 1, { images: [], imageUrl: 'https://x/y.jpg' }),
          dish('i2', 'S', 'No image at all', 1, { images: null, imageUrl: null }),
        ],
      })
    );
    assert.deepEqual(products[0].images, ['https://x/y.jpg']);
    assert.deepEqual(products[1].images, []);
  });

  it('sets compareAtPrice only when oldPrice is higher than the price', () => {
    assert.equal(byId('6a60035a9a705be4489f0757').compareAtPrice, 70000);
    assert.equal(byId('6aa076f3f31bf39e960645e3').compareAtPrice, undefined);

    const { products } = buildCatalog(
      lokmagoExport({ dishes: [dish('o1', 'S', 'Not a discount', 100, { oldPrice: 100 })] })
    );
    assert.equal(products[0].compareAtPrice, undefined);
  });

  it('marks hits and trending dishes as featured; nothing is "new"', () => {
    assert.equal(byId('6aa076f3f31bf39e960645e4').isFeatured, true);
    assert.equal(byId('6aa076f3f31bf39e960645e3').isFeatured, false);
    assert.ok(catalog.products.every((p) => p.isNew === false));
  });

  it('omits an empty description and an unparseable weight', () => {
    const { products } = buildCatalog(
      lokmagoExport({ dishes: [dish('d1', 'S', 'Bare', 1, { description: '  ', weight: 'heavy' })] })
    );
    assert.equal(products[0].description, undefined);
    assert.equal(products[0].weight, undefined);
  });

  it('treats anything but an explicit true as unavailable', () => {
    const { products } = buildCatalog(
      lokmagoExport({
        dishes: [
          dish('u1', 'S', 'Missing flag', 1, { isAvailable: undefined }),
          dish('u2', 'S', 'String flag', 1, { isAvailable: 'true' }),
          dish('u3', 'S', 'Real flag', 1, { isAvailable: true }),
        ],
      })
    );
    assert.deepEqual(
      products.map((p) => p.isAvailable),
      [false, false, true]
    );
  });
});

describe('buildCatalog — options and variants', () => {
  const { products } = buildCatalog(lokmagoExport());
  const lavash = products.find((p) => p.name.uz === 'Lavash')!;
  const asarti = products.find((p) => p.name.uz === 'Asarti')!;

  it('turns the variant group into variants, first one default', () => {
    assert.deepEqual(lavash.variants, [
      { name: '40', price: 25000, isDefault: true },
      { name: '30', price: 15000 },
    ]);
  });

  it('passes option groups through, add-ons included', () => {
    assert.equal(lavash.optionGroups.length, 2);
    assert.equal(lavash.optionGroups[0].kind, 'addon');
    assert.equal(lavash.optionGroups[1].required, true);
  });

  it('keeps the mandatory flag on options', () => {
    assert.equal(asarti.optionGroups[0].options[0].mandatory, true);
    assert.equal(lavash.optionGroups[0].options[0].mandatory, false);
  });

  it('gives dishes without options empty variants', () => {
    const plain = products.find((p) => p.name.uz === 'Pasta')!;
    assert.deepEqual(plain.variants, []);
    assert.deepEqual(plain.optionGroups, []);
  });
});

describe('buildCatalog — bad input', () => {
  it('skips dishes that fail validation and counts them', () => {
    const { products, skipped } = buildCatalog(
      lokmagoExport({
        dishes: [
          dish('g1', 'S', 'Good', 10),
          { ...dish('b1', 'S', 'No price', 10), price: undefined },
          { ...dish('b2', 'S', '', 10) },
          { name: 'No id', section: 'S', price: 10 },
          'not even an object',
          null,
        ],
      })
    );
    assert.deepEqual(
      products.map((p) => p._id),
      ['g1']
    );
    assert.equal(skipped, 5);
  });

  it('never prices a dish at 0 because its price was null, blank or boolean', () => {
    const { products } = buildCatalog(
      lokmagoExport({
        dishes: [
          { ...dish('n1', 'S', 'Null price', 1), price: null },
          { ...dish('n2', 'S', 'Blank price', 1), price: '' },
          { ...dish('n3', 'S', 'Bool price', 1), price: true },
          { ...dish('n4', 'S', 'String price', 1), price: '12500' },
        ],
      })
    );
    assert.deepEqual(
      products.map((p) => [p._id, p.price]),
      [['n4', 12500]]
    );
  });

  it('hides a dish whose option price is broken instead of guessing 0', () => {
    const { products, skipped } = buildCatalog(
      lokmagoExport({
        dishes: [
          dish('o1', 'S', 'Broken option', 10, {
            optionGroups: [
              {
                title: 'Size',
                required: true,
                multiple: false,
                kind: 'variant',
                options: [{ name: 'L', price: null }],
              },
            ],
          }),
          dish('o2', 'S', 'Fine', 10),
        ],
      })
    );
    assert.deepEqual(
      products.map((p) => p._id),
      ['o2']
    );
    assert.equal(skipped, 1);
  });

  it('keeps the first of two dishes sharing an id', () => {
    const { products, skipped } = buildCatalog(
      lokmagoExport({ dishes: [dish('dup', 'S', 'First', 1), dish('dup', 'S', 'Second', 2)] })
    );
    assert.equal(products.length, 1);
    assert.equal(products[0].name.uz, 'First');
    assert.equal(skipped, 1);
  });

  it('files a dish with no section under "Boshqa"', () => {
    const { products } = buildCatalog(
      lokmagoExport({ dishes: [{ ...dish('s1', 'x', 'No section', 1), section: undefined }] })
    );
    assert.equal(products[0].section, 'Boshqa');
  });

  it('accepts an empty menu', () => {
    const catalog = buildCatalog(lokmagoExport({ dishes: [] }));
    assert.deepEqual(catalog.products, []);
    assert.equal(catalog.skipped, 0);
  });

  for (const [label, payload] of [
    ['null', null],
    ['a string', 'oops'],
    ['ok:false', { ok: false, dishes: [] }],
    ['no dishes', { ok: true }],
    ['dishes not an array', { ok: true, dishes: {} }],
  ] as const) {
    it(`rejects ${label} as not a catalog`, () => {
      assert.throws(() => buildCatalog(payload), LokmagoPayloadError);
    });
  }
});

describe('parseWeightGrams', () => {
  const cases: Array<[string | number | null | undefined, number | undefined]> = [
    ['', undefined],
    [null, undefined],
    [undefined, undefined],
    ['800', 800],
    [' 800 ', 800],
    ['800 g', 800],
    ['800gr', 800],
    ['1.2 kg', 1200],
    ['1,5 кг', 1500],
    [1200, 1200],
    [0, undefined],
    [-5, undefined],
    ['about a kilo', undefined],
    ['0', undefined],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(parseWeightGrams(input), expected);
    });
  }
});

describe('normalizeForSearch', () => {
  it('ignores every Uzbek apostrophe variant and case', () => {
    for (const apostrophe of ["'", '‘', '’', 'ʻ', 'ʼ', '`']) {
      assert.equal(normalizeForSearch(`To${apostrophe}y TORTI`), 'toy torti');
    }
  });
});
