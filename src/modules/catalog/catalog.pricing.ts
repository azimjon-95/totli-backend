import type { SourceProduct } from '../../infrastructure/lokmago/lokmago.types.js';
import { ValidationError } from '../../shared/errors.js';

export interface PricedItem {
  /** What one unit costs right now, according to the catalog. */
  unitPrice: number;
  /** Display name, with the chosen size appended when there is one. */
  name: string;
  /** The variant that was applied, if any. */
  variantName?: string;
}

/**
 * Prices one unit of a product from the *catalog*, never from the client.
 *
 * - A chosen size sets the price to that size's price. When sizes are required
 *   and none is chosen the request is rejected — guessing a default would
 *   charge the wrong amount. Optional sizes fall back to the product's price.
 * - A `variantName` sent for a product that has no sizes is ignored rather
 *   than stored — it cannot affect the price.
 * - Mandatory add-ons (e.g. a box) are always part of the price. Optional
 *   add-ons need an explicit selection the API doesn't carry yet, so they are
 *   not applied.
 */
export function priceProduct(product: SourceProduct, variantName?: string | null): PricedItem {
  let unitPrice = product.price;
  let name = product.name.uz;
  let applied: string | undefined;

  if (product.variants.length > 0) {
    if (variantName) {
      const variant = product.variants.find((v) => v.name === variantName);
      if (!variant) throw new ValidationError('Invalid product variant');

      unitPrice = variant.price;
      name = `${name} (${variant.name})`;
      applied = variant.name;
    } else if (product.optionGroups.some((g) => g.kind === 'variant' && g.required)) {
      throw new ValidationError(`"${product.name.uz}" uchun o'lchamni tanlang`);
    }
    // Sizes that are optional and unchosen: the product's own price applies.
  }

  for (const group of product.optionGroups) {
    if (group.kind === 'variant') continue;
    for (const option of group.options) {
      if (option.mandatory) unitPrice += option.price;
    }
  }

  return { unitPrice, name, ...(applied ? { variantName: applied } : {}) };
}
