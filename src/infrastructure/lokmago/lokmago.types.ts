import { z } from 'zod';

/**
 * Shape of the LokmaGo export (`GET /j/<id>/<restaurantId>`).
 *
 * Validation is deliberately per-dish and lenient about everything we don't
 * use: the upstream carries ~40 fields per dish that change without notice,
 * and one malformed dish must never take the whole catalog down. Unknown keys
 * are stripped, which also keeps the in-memory snapshot small.
 */

/**
 * A price must be a real number or a non-blank numeric string. `z.coerce.number()`
 * alone would turn `null`, `""` and `true` into 0/1 — a dish with a missing
 * price would quietly sell for free.
 */
const money = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number().finite().min(0));

const optionSchema = z.object({
  _id: z.string().optional(),
  name: z.string().trim().min(1),
  // No `.catch()` on purpose: a broken option price invalidates the dish
  // (it is hidden) instead of being priced at 0.
  price: money,
  mandatory: z.boolean().catch(false),
});

const optionGroupSchema = z.object({
  _id: z.string().optional(),
  title: z.string().catch(''),
  required: z.boolean().catch(false),
  multiple: z.boolean().catch(false),
  /** `variant` = pick one, option price is the full price; `addon` = extra, price is added. */
  kind: z.string().catch('addon'),
  options: z.array(optionSchema),
});

export const dishSchema = z.object({
  _id: z.string().trim().min(1),
  section: z.string().trim().min(1).catch('Boshqa'),
  name: z.string().trim().min(1),
  description: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  price: money,
  oldPrice: money.nullish().catch(null),
  imageUrl: z.string().nullish().catch(null),
  images: z.array(z.string()).nullish().catch(null),
  prepMinutes: z.coerce.number().finite().min(0).nullish().catch(null),
  weight: z.union([z.string(), z.number()]).nullish().catch(null),
  ingredients: z.array(z.string()).nullish().catch(null),
  // No `.catch()`: unreadable option groups must not turn into "no options".
  optionGroups: z.array(optionGroupSchema).nullish(),
  isHit: z.boolean().catch(false),
  isTrending: z.boolean().catch(false),
  isDiscounted: z.boolean().catch(false),
  /** Anything other than an explicit `true` counts as unavailable — never sell by accident. */
  isAvailable: z.boolean().catch(false),
  createdAt: z.string().nullish().catch(null),
  updatedAt: z.string().nullish().catch(null),
});

export type LokmagoDish = z.infer<typeof dishSchema>;
export type LokmagoOptionGroup = z.infer<typeof optionGroupSchema>;

/** Top-level envelope. `dishes` stays `unknown[]` so each dish can fail on its own. */
export const exportEnvelopeSchema = z.object({
  ok: z.literal(true),
  exportedAt: z.string().optional(),
  dishes: z.array(z.unknown()),
});

export type LokmagoEnvelope = z.infer<typeof exportEnvelopeSchema>;

/* -------------------------------------------------------------- catalog */

export interface CatalogVariant {
  name: string;
  price: number;
  isDefault?: boolean;
}

export interface CatalogOption {
  name: string;
  price: number;
  mandatory: boolean;
}

export interface CatalogOptionGroup {
  title: string;
  required: boolean;
  multiple: boolean;
  kind: string;
  options: CatalogOption[];
}

/**
 * A dish as LokmaGo describes it, before it is placed in a TOTLI category.
 * `section` is LokmaGo's own grouping and is kept untouched.
 */
export interface SourceProduct {
  /** LokmaGo dish id — an opaque string, not something to cast to ObjectId. */
  _id: string;
  /** Mirrors `_id`: upstream has no slugs, and the Mini App routes by `slug`. */
  slug: string;
  name: { uz: string };
  description?: { uz: string };
  section: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  /** Grams, when the upstream value is parseable. */
  weight?: number;
  prepMinutes?: number;
  ingredients: string[];
  variants: CatalogVariant[];
  optionGroups: CatalogOptionGroup[];
  isAvailable: boolean;
  isNew: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** What one fetch from LokmaGo yields. This is what the cache holds. */
export interface SourceCatalog {
  exportedAt?: string;
  products: SourceProduct[];
  /** Dishes dropped because they failed validation or repeated an id. */
  skipped: number;
}

export interface SourceSnapshot extends SourceCatalog {
  /** Epoch ms of the successful fetch this snapshot came from. */
  fetchedAt: number;
}

export interface CatalogCategory {
  /** Same as `slug` — categories have no id of their own. */
  _id: string;
  slug: string;
  /**
   * `app`: one of the storefront's own categories (it has artwork).
   * `extra`: a LokmaGo section that matches none of them, shown as it came.
   */
  kind: 'app' | 'extra';
  name: { uz: string };
  sortOrder: number;
  isActive: boolean;
  /** Dishes customers can actually order. */
  availableCount: number;
  /** All dishes in the category, orderable or not. */
  totalCount: number;
}

export interface CatalogProduct extends SourceProduct {
  categorySlug: string;
  /** Same as `categorySlug`; kept because the client contract names it `categoryId`. */
  categoryId: string;
  /** `manual`: an admin placed it here. `auto`: it follows its LokmaGo section. */
  categorySource: 'manual' | 'auto';
  /** Where it would be without the admin's override. */
  autoCategorySlug: string;
}

/** The catalog with categories applied. */
export interface CatalogData {
  exportedAt?: string;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  skipped: number;
}

export interface CatalogView extends CatalogData {
  fetchedAt: number;
  productById: ReadonlyMap<string, CatalogProduct>;
  categoryBySlug: ReadonlyMap<string, CatalogCategory>;
}
