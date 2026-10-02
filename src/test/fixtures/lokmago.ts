/**
 * A trimmed copy of the real LokmaGo export (2026-10-02): same sections, same
 * quirks — an unavailable "Milliy taom" section, a dish with a size picker, a
 * mandatory add-on, an `oldPrice`, ids shared between `dishes` and the
 * (ignored) `menuBySection` mirror.
 */

type Raw = Record<string, unknown>;

const img = (n: string) => `https://res.cloudinary.com/x/image/upload/v1/totli/images/${n}.jpg`;

export function dish(
  id: string,
  section: string,
  name: string,
  price: number,
  extra: Raw = {}
): Raw {
  return {
    _id: id,
    restaurantId: '6a5ff4869a705be4489f06b6',
    section,
    name,
    description: `${name} — tavsif`,
    price,
    category: 'shirinlik',
    tint: '#FAEEDA',
    icon: 'ti-bowl',
    imageUrl: img(id),
    images: [img(id)],
    prepMinutes: 30,
    priceMode: 'sync',
    dineInPrice: null,
    weight: '',
    ingredients: [],
    optionGroups: [],
    isHit: false,
    isTrending: false,
    isDiscounted: false,
    isAvailable: true,
    createdAt: '2026-09-08T20:58:27.671Z',
    updatedAt: '2026-09-08T20:58:27.671Z',
    ...extra,
  };
}

export function lokmagoExport(overrides: { dishes?: unknown[] } = {}): Raw {
  const dishes = overrides.dishes ?? [
    dish('6aa076f3f31bf39e960645e3', 'Bayram tortlari', 'Rafaelo «Romantik»', 150000),
    dish('6aa076f3f31bf39e960645e4', 'Bayram tortlari', 'Yashil «Elegant»', 135000, {
      isHit: true,
    }),
    dish('6aa076f3f31bf39e960645e1', 'Bentolar', 'Oq «Happy Birthday» (gulli)', 110000),
    dish('6aa076f3f31bf39e960645e5', 'Bolalar tortlari', 'Oq «Ismlar doirasi»', 220000),
    dish('6aa076f3f31bf39e960645e6', 'Bolalar tortlari', 'Детский торт', 150000, {
      createdAt: '2026-09-20T10:00:00.000Z',
    }),
    // Unavailable section: three dishes, none orderable.
    dish('6ab773268be3984b8362471c', 'Milliy taom', 'Asarti', 400000, {
      isAvailable: false,
      optionGroups: [
        {
          title: 'Qo‘shimchalar',
          required: false,
          multiple: true,
          kind: 'addon',
          options: [{ name: 'Box', price: 2000, mandatory: true }],
        },
      ],
    }),
    dish('6ab58c31c2bb19796a296344', 'Milliy taom', 'Lavash', 15000, {
      isAvailable: false,
      optionGroups: [
        {
          title: 'Qo‘shimchalar',
          required: false,
          multiple: true,
          kind: 'addon',
          options: [{ name: 'Box', price: 2000 }],
        },
        {
          title: 'Hajmi',
          required: true,
          multiple: false,
          kind: 'variant',
          options: [
            { name: '40', price: 25000 },
            { name: '30', price: 15000 },
          ],
        },
      ],
    }),
    dish('6a60035a9a705be4489f0757', 'Milliy taom', 'Pasta', 10000, {
      isAvailable: false,
      oldPrice: 70000,
    }),
    dish('6aa076f3f31bf39e960645e2', 'Setlar', '"”Unutilmas Bayram" sovg\'alar to\'plami', 280000),
    dish('6aa076f3f31bf39e960645de', "To'y tortlari", '"Oq Oltin" nafis qaymoq torti', 280000),
    dish('6aa076f3f31bf39e960645dc', "To'y tortlari", 'Oq «Hashamat»', 850000),
    dish('6aa076f3f31bf39e960645da', "To'y tortlari", '💍 Kelin-Kuyov To‘yi Torti', 800000),
    dish('6aa076f3f31bf39e960645d8', "Tug'ilgan kun tortlari", '"60 Yubiley" tantanali torti', 600000),
    dish('6aa076f3f31bf39e960645d6', "Tug'ilgan kun tortlari", 'Karonali «Princess»', 160000),
    dish('6aa076f3f31bf39e960645d4', "Tug'ilgan kun tortlari", 'Shokoladli drip', 145000),
    dish('6aa076f3f31bf39e960645d5', "Tug'ilgan kun tortlari", 'Shokoladli «Happy Birthday»', 105000),
    dish('6aa076f3f31bf39e960645df', 'Unashtiruv tortlari', 'Yurak «Love»', 135000),
    dish('6aa076f3f31bf39e960645e0', 'Unashtiruv tortlari', '«Marry Me» romantika', 180000),
  ];

  return {
    ok: true,
    exportedAt: '2026-10-02T07:36:38.977Z',
    restaurant: { _id: '6a5ff4869a705be4489f06b6', name: 'TOTLI Tortlari' },
    dishes,
    // The real export mirrors every dish again here; the mapper must ignore it.
    menuBySection: {},
    meta: { dishCount: dishes.length },
  };
}
