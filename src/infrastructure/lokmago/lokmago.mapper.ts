import {
  dishSchema,
  exportEnvelopeSchema,
  type CatalogOptionGroup,
  type CatalogVariant,
  type LokmagoDish,
  type SourceCatalog,
  type SourceProduct,
  type SourceSnapshot,
} from './lokmago.types.js';

/** The upstream answered, but not with a catalog we can use. */
export class LokmagoPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LokmagoPayloadError';
  }
}

/* ---------------------------------------------------------------- helpers */

/**
 * Uzbek apostrophes come in at least six code points (' ‘ ’ ʻ ʼ `). Searching
 * for "toy" must find "To‘y torti" however the owner happened to type it.
 */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/['\u2018\u2019\u02bb\u02bc`\u00b4]/g, '');
}

/**
 * Upstream `weight` is a free-form string (`""` for every dish today). Accept
 * a bare number or a number with a gram/kilogram unit; anything else is
 * "unknown" rather than a guess.
 */
export function parseWeightGrams(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : undefined;

  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:[.,]\d+)?)\s*(kg|кг|g|gr|gramm|г)?$/u);
  if (!match) return undefined;

  const value = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;

  const unit = match[2];
  return unit === 'kg' || unit === 'кг' ? Math.round(value * 1000) : value;
}

function mapOptionGroups(dish: LokmagoDish): CatalogOptionGroup[] {
  return (dish.optionGroups ?? []).map((group) => ({
    title: group.title,
    required: group.required,
    multiple: group.multiple,
    kind: group.kind,
    options: group.options.map((o) => ({
      name: o.name,
      price: o.price,
      mandatory: o.mandatory,
    })),
  }));
}

/**
 * The first `variant` group becomes the product's `variants`, which is what
 * the cart/order API (`variantName`) already understands.
 *
 * A variant option's price is the *full* price of that size, not a delta —
 * checked against the live export, where Lavash's base price (15 000) equals
 * its "30" variant. Add-ons, by contrast, are additive (see `catalog.pricing`).
 */
function mapVariants(groups: CatalogOptionGroup[]): CatalogVariant[] {
  const group = groups.find((g) => g.kind === 'variant' && g.options.length > 0);
  if (!group) return [];
  return group.options.map((o, i) => ({
    name: o.name,
    price: o.price,
    ...(i === 0 ? { isDefault: true } : {}),
  }));
}

function mapImages(dish: LokmagoDish): string[] {
  const list = dish.images?.length ? dish.images : dish.imageUrl ? [dish.imageUrl] : [];
  return list.map((u) => u.trim()).filter(Boolean);
}

function mapProduct(dish: LokmagoDish, sortOrder: number): SourceProduct {
  const optionGroups = mapOptionGroups(dish);
  const description = dish.description.trim();
  const weight = parseWeightGrams(dish.weight);

  return {
    _id: dish._id,
    slug: dish._id,
    name: { uz: dish.name },
    ...(description ? { description: { uz: description } } : {}),
    section: dish.section,
    images: mapImages(dish),
    price: dish.price,
    // A "compare at" price that isn't higher than the price is not a discount.
    ...(dish.oldPrice != null && dish.oldPrice > dish.price
      ? { compareAtPrice: dish.oldPrice }
      : {}),
    ...(weight !== undefined ? { weight } : {}),
    ...(dish.prepMinutes != null ? { prepMinutes: dish.prepMinutes } : {}),
    ingredients: dish.ingredients ?? [],
    variants: mapVariants(optionGroups),
    optionGroups,
    isAvailable: dish.isAvailable,
    // Upstream has no "new" notion; the storefront sorts by createdAt instead.
    isNew: false,
    isFeatured: dish.isHit || dish.isTrending,
    sortOrder,
    ...(dish.createdAt ? { createdAt: dish.createdAt } : {}),
    ...(dish.updatedAt ? { updatedAt: dish.updatedAt } : {}),
  };
}

/* ------------------------------------------------------------------- main */

/**
 * LokmaGo export → dishes.
 *
 * Dishes that fail validation, or repeat an id, are skipped and counted — the
 * rest of the catalog still serves. Placing dishes in categories is a separate
 * step (`catalog.categories`), because it also depends on the admin's choices.
 *
 * @throws LokmagoPayloadError when the envelope itself is unusable.
 */
export function buildCatalog(raw: unknown): SourceCatalog {
  const envelope = exportEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new LokmagoPayloadError(
      'LokmaGo response is not a catalog export (expected { ok: true, dishes: [] })'
    );
  }

  const seenIds = new Set<string>();
  const products: SourceProduct[] = [];
  let skipped = 0;

  for (const candidate of envelope.data.dishes) {
    const parsed = dishSchema.safeParse(candidate);
    if (!parsed.success || seenIds.has(parsed.data._id)) {
      skipped++;
      continue;
    }
    seenIds.add(parsed.data._id);
    products.push(mapProduct(parsed.data, products.length));
  }

  return { exportedAt: envelope.data.exportedAt, products, skipped };
}

export function toSnapshot(data: SourceCatalog, fetchedAt: number): SourceSnapshot {
  return { ...data, fetchedAt };
}
