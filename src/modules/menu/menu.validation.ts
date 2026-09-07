import { z } from 'zod';

const boolFlag = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

export const menuQuerySchema = z.object({
  /**
   * When set, localized fields collapse to a single string in that language
   * (falling back to `uz`). The QR menu page renders one language at a time,
   * so this keeps the payload roughly a third of the size.
   */
  lang: z.enum(['uz', 'ru', 'en']).optional(),
  /** Only one section — used by deep links like `/menu?category=tortlar`. */
  category: z.string().min(1).max(120).optional(),
  /** Drop sold-out items instead of listing them as unavailable. */
  available: boolFlag.optional(),
  /** Keep sections that currently have no products (hidden by default). */
  includeEmpty: boolFlag.optional(),
});

export type MenuQuery = z.infer<typeof menuQuerySchema>;
