import { slugify } from '../../shared/slug.js';
import type {
  CatalogCategory,
  CatalogData,
  CatalogProduct,
  SourceCatalog,
} from '../../infrastructure/lokmago/lokmago.types.js';

/**
 * Where each dish is shelved.
 *
 * Three layers, strongest first:
 *   1. an admin's choice for that dish (stored in MongoDB);
 *   2. the storefront category its LokmaGo `section` matches by name;
 *   3. the section itself, shown as it came ("extra" category).
 *
 * Everything here is pure: same input, same shelves.
 */

export interface AppCategoryDef {
  /** The slug the storefront's artwork is keyed by — changing one is a breaking change. */
  slug: string;
  name: string;
  /** Normalised section names (see `normalizeSectionKey`) that belong here. */
  aliases: readonly string[];
}

/**
 * The storefront's own categories, in the order they are shown. A LokmaGo
 * section that matches one of these lands in it; the rest stay as they are.
 */
export const APP_CATEGORIES: readonly AppCategoryDef[] = [
  {
    slug: 'tugilgan-kun',
    name: "Tug'ilgan kun tortlari",
    aliases: ['tugilgan kun', 'tugulgan kun', 'birthday', 'день рождения', 'торты на день рождения'],
  },
  {
    slug: 'toy',
    name: "To'y tortlari",
    aliases: ['toy', 'wedding', 'свадебные', 'свадебный'],
  },
  {
    slug: 'unashtiruv',
    name: 'Unashtiruv tortlari',
    aliases: ['unashtiruv', 'unashtirish', 'engagement', 'помолвка', 'торты на помолвку'],
  },
  {
    slug: 'bento',
    name: 'Bentolar',
    aliases: ['bento', 'bentolar'],
  },
  {
    slug: 'set',
    name: 'Setlar',
    aliases: ['set', 'setlar', 'sets', 'наборы'],
  },
  {
    slug: 'yangi-yil',
    name: 'Yangi yil tortlari',
    aliases: ['yangi yil', 'yangiyil', 'new year', 'новогодние'],
  },
  {
    slug: 'bayram',
    name: 'Bayram tortlari',
    aliases: ['bayram', 'barcha bayram', 'holiday', 'праздничные'],
  },
  {
    slug: 'bolalar',
    name: 'Bolalar tortlari',
    aliases: ['bolalar', 'kids', 'детские', 'детский'],
  },
  {
    slug: 'shirinliklar',
    name: 'Shirinliklar',
    aliases: ['shirinliklar', 'shirinlik', 'desert', 'desertlar', 'десерты'],
  },
  {
    slug: 'korporativ',
    name: 'Korporativ tortlar',
    aliases: ['korporativ', 'corporate', 'корпоративные'],
  },
];

/** The same slugs, for validating that a category exists even while it is empty. */
export const APP_CATEGORY_SLUGS: ReadonlySet<string> = new Set(APP_CATEGORIES.map((c) => c.slug));

/* ---------------------------------------------------------------- matching */

/** Words that only say "this is a cake section" and don't tell sections apart. */
const GENERIC_SUFFIX = /\s+(tortlari|tortlar|torti|tort|torta|cakes|cake|торты|торт)$/u;

/**
 * "To‘y  Tortlari" → "toy tortlari". Uzbek apostrophes (' ‘ ’ ʻ ʼ `) are
 * dropped rather than turned into spaces, so "Tug'ilgan" and "Tugilgan" agree.
 */
export function normalizeSectionKey(section: string): string {
  return section
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bb\u02bc`\u00b4]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_INDEX: ReadonlyMap<string, AppCategoryDef> = new Map(
  APP_CATEGORIES.flatMap((def) => [
    [normalizeSectionKey(def.name), def] as const,
    ...def.aliases.map((a) => [normalizeSectionKey(a), def] as const),
  ])
);

/**
 * The storefront category a LokmaGo section belongs to, if any. Matches the
 * whole name or the name without its "tortlari"-style ending, so "To'y
 * tortlari", "To'y torti" and "To'y" all agree.
 */
export function matchAppCategory(section: string): AppCategoryDef | undefined {
  const key = normalizeSectionKey(section);
  return ALIAS_INDEX.get(key) ?? ALIAS_INDEX.get(key.replace(GENERIC_SUFFIX, ''));
}

/* ------------------------------------------------------------ organisation */

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

/**
 * Places every dish in a category and builds the category list.
 *
 * @param assignments dish id → category slug, as chosen by an admin. An entry
 *   whose category no longer exists is ignored (the dish falls back to
 *   automatic) rather than hiding the dish.
 *
 * The result lists all storefront categories first (even empty ones, so an
 * admin can move a dish into them), then the "extra" sections in the order
 * LokmaGo first mentions them.
 */
export function organizeCatalog(
  source: SourceCatalog,
  assignments: ReadonlyMap<string, string> = new Map()
): CatalogData {
  const categories = new Map<string, CatalogCategory>();

  for (const [index, def] of APP_CATEGORIES.entries()) {
    categories.set(def.slug, {
      _id: def.slug,
      slug: def.slug,
      kind: 'app',
      name: { uz: def.name },
      sortOrder: index,
      isActive: true,
      availableCount: 0,
      totalCount: 0,
    });
  }

  // Pass 1 — automatic placement. This also discovers every "extra" section,
  // so pass 2 can tell whether an admin's chosen category exists.
  const usedSlugs = new Set(APP_CATEGORY_SLUGS);
  const extraSlugBySection = new Map<string, string>();
  const autoSlugOf = new Map<string, string>();

  for (const product of source.products) {
    const matched = matchAppCategory(product.section);
    if (matched) {
      autoSlugOf.set(product._id, matched.slug);
      continue;
    }

    let slug = extraSlugBySection.get(product.section);
    if (!slug) {
      slug = uniqueSlug(slugify(product.section), usedSlugs);
      extraSlugBySection.set(product.section, slug);
      categories.set(slug, {
        _id: slug,
        slug,
        kind: 'extra',
        name: { uz: product.section },
        sortOrder: APP_CATEGORIES.length + extraSlugBySection.size - 1,
        isActive: true,
        availableCount: 0,
        totalCount: 0,
      });
    }
    autoSlugOf.set(product._id, slug);
  }

  // Pass 2 — apply the admin's choices and count.
  const products: CatalogProduct[] = source.products.map((product) => {
    const autoCategorySlug = autoSlugOf.get(product._id)!;
    const chosen = assignments.get(product._id);
    const manual = chosen !== undefined && categories.has(chosen);
    const categorySlug = manual ? chosen : autoCategorySlug;

    const category = categories.get(categorySlug)!;
    category.totalCount++;
    if (product.isAvailable) category.availableCount++;

    return {
      ...product,
      categorySlug,
      categoryId: categorySlug,
      categorySource: manual ? 'manual' : 'auto',
      autoCategorySlug,
    };
  });

  return {
    exportedAt: source.exportedAt,
    categories: [...categories.values()],
    products,
    skipped: source.skipped,
  };
}
