import { z } from 'zod';

const localizedName = z.object({
  uz: z.string().min(1).max(200),
  ru: z.string().max(200).optional(),
  en: z.string().max(200).optional(),
});

const imageSchema = z.union([
  z.string().url(),
  z.object({
    url: z.string().url(),
    publicId: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    format: z.string().optional(),
  }),
]);

export const createProductSchema = z.object({
  name: localizedName,
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z
    .object({
      uz: z.string().max(5000).optional(),
      ru: z.string().max(5000).optional(),
      en: z.string().max(5000).optional(),
    })
    .optional(),
  categoryId: z.string().min(1),
  images: z.array(imageSchema).max(20).default([]),
  price: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().min(0).optional(),
  weight: z.coerce.number().min(0).optional(),
  servings: z.coerce.number().min(0).optional(),
  ingredients: z.array(z.string().max(100)).max(50).optional(),
  allergens: z.array(z.string().max(100)).max(30).optional(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        price: z.coerce.number().min(0),
        weight: z.coerce.number().min(0).optional(),
        servings: z.coerce.number().min(0).optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .optional(),
  isAvailable: z.boolean().default(true),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  stock: z.coerce.number().min(0).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const updateProductSchema = createProductSchema.partial();

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'sort_order']).optional(),
  isNew: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isFeatured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isAvailable: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
