import { z } from 'zod';

const localizedName = z.object({
  uz: z.string().min(1).max(120),
  ru: z.string().max(120).optional(),
  en: z.string().max(120).optional(),
});

const localizedDesc = z
  .object({
    uz: z.string().max(2000).optional(),
    ru: z.string().max(2000).optional(),
    en: z.string().max(2000).optional(),
  })
  .optional();

export const createCategorySchema = z.object({
  name: localizedName,
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug')
    .optional(),
  description: localizedDesc,
  image: z.string().url().optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();
