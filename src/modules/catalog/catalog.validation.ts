import { z } from 'zod';

const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

/**
 * Same query contract the storefront already uses (`category`, `search`,
 * `sort`, `page`, `limit`), plus `section` from the catalog spec. `category`,
 * `categoryId` and `section` are interchangeable: each accepts a category slug
 * or the section's exact name.
 */
export const catalogProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().max(120).optional(),
  categoryId: z.string().max(120).optional(),
  section: z.string().max(120).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'sort_order']).optional(),
  isNew: boolFlag,
  isFeatured: boolFlag,
  isAvailable: boolFlag,
});

export type CatalogProductQuery = z.infer<typeof catalogProductQuerySchema>;

/** Dish ids are opaque upstream strings; this only keeps junk and oversize input out. */
export const catalogIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const assignCategoryBodySchema = z.object({
  categorySlug: z.string().trim().min(1).max(120),
});
