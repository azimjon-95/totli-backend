import { CategoryModel } from './category.model.js';
import { logger } from '../../infrastructure/logger/index.js';

/**
 * The shop's categories are a fixed, curated list rather than something the
 * admin creates ad hoc: the storefront renders a hand-drawn icon per slug, so
 * an unknown slug would have no artwork. They are upserted on every boot,
 * which keeps a fresh database usable and lets the list evolve in code review
 * instead of through the admin UI.
 *
 * Slugs are the contract with the frontend icon map — renaming one is a
 * breaking change, adding one needs a matching icon.
 */
export const STATIC_CATEGORIES = [
  { slug: 'tugilgan-kun', uz: "Tug'ilgan kun tortlari", ru: 'Торты на день рождения' },
  { slug: 'toy', uz: "To'y tortlari", ru: 'Свадебные торты' },
  { slug: 'unashtiruv', uz: 'Unashtiruv tortlari', ru: 'Торты на помолвку' },
  { slug: 'bento', uz: 'Bentolar', ru: 'Бенто-торты' },
  { slug: 'set', uz: 'Setlar', ru: 'Наборы' },
  { slug: 'yangi-yil', uz: 'Yangi yil tortlari', ru: 'Новогодние торты' },
  { slug: 'bayram', uz: 'Bayram tortlari', ru: 'Праздничные торты' },
  { slug: 'bolalar', uz: 'Bolalar tortlari', ru: 'Детские торты' },
  { slug: 'shirinliklar', uz: 'Shirinliklar', ru: 'Десерты' },
  { slug: 'korporativ', uz: 'Korporativ tortlar', ru: 'Корпоративные торты' },
] as const;

export type CategorySlug = (typeof STATIC_CATEGORIES)[number]['slug'];

/**
 * Upserts the curated list. Existing categories keep whatever image and
 * description were set on them — only the name, order and active flag are
 * kept in sync, so re-running this is always safe.
 */
export async function ensureStaticCategories(): Promise<void> {
  const results = await Promise.all(
    STATIC_CATEGORIES.map((category, index) =>
      CategoryModel.updateOne(
        { slug: category.slug },
        {
          $set: {
            name: { uz: category.uz, ru: category.ru },
            sortOrder: index,
            isActive: true,
          },
        },
        { upsert: true }
      )
    )
  );

  const created = results.filter((r) => r.upsertedCount > 0).length;
  logger.info('Static categories ensured', {
    total: STATIC_CATEGORIES.length,
    created,
  });
}
