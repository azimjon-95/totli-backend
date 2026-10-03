# Katalog (LokmaGo) va guruh pin xabari

## 1. Katalog qayerdan keladi

Mahsulotlar va kategoriyalar **MongoDB'da saqlanmaydi**. Yagona manba — LokmaGo export:

```
LOKMAGO_CATALOG_URL=https://api.lokmago.uz/j/4454/6a5ff4869a705be4489f06b6
```

Javob xotirada keshlanadi (`LOKMAGO_CACHE_TTL_SEC`, standart 180 s). Mijoz so'rovi
**faqat xotiradan** javob oladi — na LokmaGo'ga, na MongoDB'ga bormaydi.

| Holat | Xulq |
|---|---|
| Kesh yangi | xotiradan |
| Kesh eskirdi | bitta LokmaGo so'rovi (parallel so'rovlar birlashadi), 8 s timeout, 1 marta qayta urinish |
| LokmaGo ishlamayapti, kesh bor | oxirgi muvaffaqiyatli nusxa (stale), 15 s davomida qayta urinmaydi |
| LokmaGo ishlamayapti, kesh yo'q | `503 CATALOG_UNAVAILABLE` |
| Bitta taom buzuq | o'sha taom tashlab ketiladi, qolganlari ishlayveradi |

Server ishga tushganda kesh isitiladi va fonda har `TTL + 2 s` da yangilanadi, ya'ni
hech bir mijoz yangilanishni kutmaydi.

Holatni ko'rish: `GET /api/v1/health` → `catalog` (yoshi, mahsulot soni, hit/miss, oxirgi xato).

### Taom ma'lumotlari

| LokmaGo | TOTLI |
|---|---|
| `dish._id` | `_id` va `slug` (bir xil; LokmaGo'da slug yo'q) |
| `name`, `description` | `name.uz`, `description.uz` |
| `price`, `oldPrice` | `price`, `compareAtPrice` (faqat `oldPrice > price` bo'lsa) |
| `images` / `imageUrl` | `images` |
| `isAvailable` | `isAvailable` — faqat aniq `true` bo'lsa mavjud |
| `isHit` yoki `isTrending` | `isFeatured` |
| `weight` | `weight` (gramm; faqat son yoki `800 g`, `1.2 kg` ko'rinishida) |
| birinchi `variant` guruhi | `variants` |

Narxi `null`, bo'sh yoki noto'g'ri bo'lgan taom **yashiriladi** (0 so'mga sotilmasligi uchun).

## 2. Kategoriyalar

Har taom uchun kategoriya quyidagi tartibda aniqlanadi (kuchlisi birinchi):

1. **Admin tanlovi** — admin panelda qo'lda berilgan kategoriya.
2. **Dasturdagi kategoriya** — LokmaGo `section` nomi dasturning 10 ta kategoriyasidan biriga mos kelsa.
3. **Section o'z nomi bilan** — mos kelmasa (masalan "Milliy taom"), kelgancha ko'rsatiladi.

Dasturning kategoriyalari (frontend ikonkalari shu slug'larga bog'langan):

`tugilgan-kun` · `toy` · `unashtiruv` · `bento` · `set` · `yangi-yil` · `bayram` · `bolalar` · `shirinliklar` · `korporativ`

Moslash katta-kichik harf, bo'shliq va barcha o'zbek apostroflariga (`' ‘ ’ ʻ ʼ`` ` ``) befarq,
va "tortlari/tortlar/torti" qo'shimchasiz ham ishlaydi: `To'y tortlari`, `To'y torti`, `TOY` — hammasi `toy`.
Ruscha nomlar ham taniladi. Alias'lar `src/modules/catalog/catalog.categories.ts` da.

Mijozga faqat **buyurtma berish mumkin bo'lgan** taomi bor kategoriyalar ko'rinadi.
Admin barchasini, bo'sh dasturiy kategoriyalarni ham ko'radi (taomni ularga o'tkazish uchun).

### Admin tanlovi va "3 tekshiruv" qoidasi

Tanlov MongoDB'da (`catalogassignments`) saqlanadi: **taom ID → kategoriya**.
Taom o'zi LokmaGo'da qoladi, bu yerda faqat tanlov.

Taom ID'si LokmaGo'dan ketsa, tanlov ham yo'qolishi kerak. Qoida:

- LokmaGo'ning har **muvaffaqiyatli** o'qilishi = 1 tekshiruv.
- Taom ketma-ket `CATALOG_MISS_LIMIT` (standart **3**) tekshiruvda kelmasa, tanlovi o'chadi.
- Taom qaytib kelsa, sanoq 0 ga tushadi.
- **Hisoblanmaydi:** LokmaGo ishlamagan paytdagi o'qishlar, va bo'sh (0 ta taom) javob —
  uzilish tanlovlarni o'chirib yubormasligi uchun.

Tekshiruvlar fonda har ~3 daqiqada bo'ladi, shuning uchun 3 tekshiruv ≈ 9 daqiqa.

Admin dasturning avtomatik kategoriyasini tanlasa, hech narsa saqlanmaydi (taom section'ini
kuzatib boraveradi).

## 3. API

### Mijoz (ochiq)

| Metod | Yo'l | |
|---|---|---|
| GET | `/api/v1/categories`, `/categories/:slug` | slug yoki nom bo'yicha |
| GET | `/api/v1/products` | `category` / `categoryId` / `section`, `search`, `sort`, `isAvailable`, `page`, `limit` |
| GET | `/api/v1/products/:id` | mavjud bo'lmagan taom ham ochiladi (`isAvailable: false`) |

`sort`: `sort_order` (standart), `newest`, `price_asc`, `price_desc`, `popular`.
Qidiruv apostrofga befarq: `toy` → "To‘y torti".

### Admin (`products:read` / `products:write`)

| Metod | Yo'l | |
|---|---|---|
| GET | `/api/v1/admin/products`, `/:id` | `categorySource` (`auto`/`manual`) va `autoCategorySlug` bilan |
| GET | `/api/v1/admin/categories`, `/:id` | `kind` (`app`/`extra`) va `totalCount` bilan |
| PUT | `/api/v1/admin/products/:id/category` | `{ "categorySlug": "toy" }` — taomni kategoriyaga o'tkazadi |
| DELETE | `/api/v1/admin/products/:id/category` | avtomatikka qaytaradi |
| POST/PATCH/DELETE | `/admin/products`, `/admin/categories` | **501** — katalog LokmaGo'da tahrirlanadi |

### Narx va buyurtma

Savat va buyurtmada narx, nom va rasm **serverda katalogdan** olinadi; mijozdan narx qabul qilinmaydi.
`isAvailable: false` taom rad etiladi. Buyurtmadagi `productId` — LokmaGo ID'si (`String`).
Tanlanishi shart bo'lgan o'lcham (`variant`) tanlanmasa buyurtma rad etiladi; majburiy
qo'shimchalar (`mandatory`) narxga doim qo'shiladi.

> LokmaGo ishlamay qolsa, buyurtma oxirgi keshdagi narx bilan yaratilishi mumkin.
> Bu holat logga `Resolving prices from a stale catalog snapshot` deb yoziladi.

## 4. Banner

Banner **LokmaGo'dan emas**, TOTLI admin paneli orqali boshqariladi va MongoDB'da saqlanadi
(`GET/PUT /api/v1/admin/settings/banner`, ochiq: `GET /api/v1/settings/banner`).

- 10 tagacha slayd, rasm va video aralash. Video muted holda boshlanadi va tugagach keyingi slaydga o'tadi;
  rasm 2–30 soniya (standart 6) ko'rinadi.
- Rasm/video brauzerdan to'g'ridan-to'g'ri **Cloudinary**'ga yuklanadi (imzo `GET /api/v1/admin/uploads/signature?kind=image|video`),
  fayl serverdan o'tmaydi. `.env` da `CLOUDINARY_*` kerak.
- Faqat `https://` media manzillari va `/…` yoki `https://…` havolalari qabul qilinadi.
- Slaydlar ro'yxati berilsa, u yagona haqiqat: bo'sh ro'yxat karuselni tozalaydi.

## 5. Telegram guruh va pin tugmasi

`TELEGRAM_GROUP_ID=-1002451334889` — barcha admin bildirishnomalari shu guruhga ketadi
(`ADMIN_CHAT_ID` faqat guruh berilmagan holdagi zaxira).

Guruhda **bitta** pinlangan "Tortlarni ko'rish" (WebApp) tugmali xabar bo'ladi.

**Qachon tekshiriladi (hammasi avtomatik):**

1. Bot ishga tushganda.
2. Har kuni **09:00 (Toshkent)**.
3. Bot guruhda **admin bo'lgan zahoti** (`my_chat_member` hodisasi).
4. Qo'lda: guruhdagi admin `/check` yozsa.

**Xulq:**

- Yangi xabar **faqat** saqlangan xabar yo'q bo'lsa yoki Telegram "o'chirilgan" desa yuboriladi.
  Pin huquqi yo'qligi, tarmoq xatosi, rate limit — xabarni **qayta yaratmaydi** (guruh to'lib ketmasligi uchun).
- Mavjudligi `editMessageReplyMarkup` bilan tekshiriladi (ko'rinadigan ta'sirsiz); havola
  o'zgargan bo'lsa tugma o'zi yangilanadi.
- Guruh adminining o'z pini hurmat qilinadi: boshqa xabar pinlangan bo'lsa tegilmaydi.
  Faqat pin bo'sh bo'lsa, bizniki qaytariladi.
- Parallel chaqiruvlar ketma-ket bajariladi — ikki xabar yaratilmaydi.

**Buyruqlar (faqat `Admins` jadvalidagi, `telegramId` si bor adminlar):**

- `/check` — holatni ko'rsatadi (bot admin?, pin huquqi?, xabar bormi?, pinlanganmi?). Muammo bo'lsa va bot tuzata olsa, o'zi tuzatib qayta ko'rsatadi.
- `/setup` — yangi xabarni majburan yuboradi va eskisini olib tashlaydi.

**Tugma turi.** Telegram guruhda `web_app` tugmasini qabul qilmaydi (xabar `BUTTON_TYPE_INVALID`
bilan rad etiladi), shuning uchun guruh xabarida oddiy `url` tugma bor. U quyidagi tartibda tanlanadi:

1. `WEBAPP_DIRECT_LINK` (masalan `https://t.me/<bot>/<app>`);
2. botda **Main Mini App** yoqilgan bo'lsa `https://t.me/<bot>?startapp` — Mini App guruhning o'zida ochiladi;
3. aks holda `https://t.me/<bot>?start=shop` — botning shaxsiy chatiga olib boradi (2 bosish). `/check` bu haqda ogohlantiradi.

Main Mini App yoqish: @BotFather → `/mybots` → botni tanlang → *Bot Settings* → *Configure Mini App* →
*Enable Mini App* → URL: `WEBAPP_URL` dagi manzil.

**Guruh sozlash:** botni guruhga qo'shing → **admin** qiling va "Xabarlarni pin qilish" huquqini bering.
Shundan keyin pin xabari o'zi paydo bo'ladi.
