import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { priceProduct } from './catalog.pricing.js';
import { buildCatalog } from '../../infrastructure/lokmago/lokmago.mapper.js';
import { dish, lokmagoExport } from '../../test/fixtures/lokmago.js';
import { AppError } from '../../shared/errors.js';

const variantGroup = (required: boolean) => ({
  title: 'Hajmi',
  required,
  multiple: false,
  kind: 'variant',
  options: [
    { name: '40', price: 25000 },
    { name: '30', price: 15000 },
  ],
});
const addonGroup = (options: Array<{ name: string; price: number; mandatory?: boolean }>) => ({
  title: 'Qo‘shimchalar',
  required: false,
  multiple: true,
  kind: 'addon',
  options,
});

function product(extra: Record<string, unknown> = {}, price = 15000) {
  return buildCatalog(lokmagoExport({ dishes: [dish('p1', 'S', 'Lavash', price, extra)] }))
    .products[0];
}

const rejectsWith = (fn: () => unknown, status = 400) =>
  assert.throws(fn, (e: AppError) => e instanceof AppError && e.statusCode === status);

describe('priceProduct', () => {
  it('prices a plain product at its catalog price', () => {
    const priced = priceProduct(product({}, 150000));
    assert.deepEqual(priced, { unitPrice: 150000, name: 'Lavash' });
  });

  it('prices a chosen size at that size\'s price and names it', () => {
    const p = product({ optionGroups: [variantGroup(true)] });
    const priced = priceProduct(p, '40');
    assert.equal(priced.unitPrice, 25000);
    assert.equal(priced.name, 'Lavash (40)');
    assert.equal(priced.variantName, '40');
  });

  it('rejects a required size that was not chosen — it will not guess a price', () => {
    rejectsWith(() => priceProduct(product({ optionGroups: [variantGroup(true)] })));
  });

  it('falls back to the base price when the size is optional and unchosen', () => {
    const priced = priceProduct(product({ optionGroups: [variantGroup(false)] }));
    assert.equal(priced.unitPrice, 15000);
    assert.equal(priced.variantName, undefined);
  });

  it('rejects a size the product does not have', () => {
    rejectsWith(() => priceProduct(product({ optionGroups: [variantGroup(true)] }), 'XXL'));
  });

  it('ignores a size sent for a product that has none', () => {
    const priced = priceProduct(product({}, 99000), 'Large');
    assert.equal(priced.unitPrice, 99000);
    assert.equal(priced.variantName, undefined);
    assert.equal(priced.name, 'Lavash');
  });

  it('always includes mandatory add-ons', () => {
    const p = product({ optionGroups: [addonGroup([{ name: 'Box', price: 2000, mandatory: true }])] });
    assert.equal(priceProduct(p).unitPrice, 17000);
  });

  it('does not add optional add-ons — the API cannot carry a selection yet', () => {
    const p = product({ optionGroups: [addonGroup([{ name: 'Box', price: 2000 }])] });
    assert.equal(priceProduct(p).unitPrice, 15000);
  });

  it('stacks a mandatory add-on on top of the chosen size', () => {
    const p = product({
      optionGroups: [
        variantGroup(true),
        addonGroup([{ name: 'Box', price: 2000, mandatory: true }]),
      ],
    });
    assert.equal(priceProduct(p, '30').unitPrice, 17000);
  });
});
