# TOTLI — Backend

Telegram Mini App orqali ishlaydigan tort/shirinlik do'koni uchun REST API va Telegram bot.

Mijoz Mini App'da tort tanlaydi va buyurtma beradi — admin Telegram guruhiga darhol xabar tushadi va u yerdan statusni boshqarish mumkin.

## Texnologiyalar

| Qism | Texnologiya |
|---|---|
| Runtime | Node.js 20+ (ESM) |
| Framework | Express 4 |
| Ma'lumotlar bazasi | MongoDB (Mongoose 8) |
| Kesh / rate limit | Redis (ioredis) — ixtiyoriy, bo'lmasa ham ishlaydi |
| Validatsiya | Zod |
| Auth | JWT + Telegram `initData` HMAC tekshiruvi |
| Bot | Telegram Bot API (long polling) |

## Tuzilishi

```
src/
├── index.ts              # kirish nuqtasi (HTTP server + bot)
├── app.ts                # Express ilovasi va route'lar
├── config/               # env (zod bilan validatsiya)
├── infrastructure/       # mongo, redis, logger, telegram
├── middleware/           # auth, rate limit, security, error handler
├── modules/              # auth, catalog (LokmaGo), cart, orders,
│                         # payments, delivery, statistics, settings...
├── bot/                  # bot komandalar, callback'lar, klaviaturalar
├── shared/               # tiplar, konstantalar, jwt, errors, permissions
└── scripts/seed.ts

docker/                   # nginx konfiguratsiyasi (VPS uchun)
scripts/backup.sh         # kunlik MongoDB zaxira nusxasi
Dockerfile                # production image (multi-stage)
docker-compose.prod.yml
```

## Ishga tushirish

Talab: Node.js 22 (`.nvmrc` ga qarang), MongoDB, (ixtiyoriy) Redis.

```bash
cp .env.example .env
# Kamida shularni to'ldiring:
#   MONGODB_URI, JWT_SECRET (min 16 belgi)
#   TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID yoki TELEGRAM_GROUP_ID, WEBAPP_URL

docker compose up -d      # mongo + redis
npm install
npm run seed              # boshlang'ich admin, kategoriya, mahsulotlar
npm run dev               # http://localhost:4000
```

Boshqa buyruqlar:

```bash
npm run build       # TypeScript → dist/
npm start           # production rejimida ishga tushiradi
npm run typecheck
npm test
```

## Production (Contabo VPS)

```bash
git clone https://github.com/azimjon-95/totli-backend.git /opt/totli
cd /opt/totli && cp .env.example .env && nano .env
docker compose -f docker-compose.prod.yml up -d --build
```

Mongo va Redis hech qanday portni tashqariga chiqarmaydi, API esa faqat
`127.0.0.1:4000` da eshitadi — tashqi kirish yagona nuqta, Nginx orqali boradi.

To'liq qo'llanma (firewall, TLS, DNS, zaxira nusxa, yangilash):
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Katalog

Mahsulotlar va kategoriyalar **LokmaGo**'dan keladi va MongoDB'da saqlanmaydi — faqat admin
qo'lda bergan "taom → kategoriya" tanlovlari saqlanadi. LokmaGo kategoriyalari dasturning
kategoriyalariga moslanadi, mos kelmaganlari o'z nomi bilan ko'rsatiladi.
Banner esa TOTLI admin panelidan boshqariladi.

Batafsil (kesh, "3 tekshiruv" qoidasi, API, banner, guruh pin xabari): [`docs/CATALOG.md`](docs/CATALOG.md).

## Telegram guruh ID sini olish

1. Botni guruhga admin sifatida qo'shing
2. Guruhga biror xabar yozing
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` ni oching va `chat.id` ni oling (odatda `-100...` bilan boshlanadi)

Bot buyruqlari (adminlar uchun): `/orders`, `/today`, `/check` (guruhdagi pin tugmasini tekshirish), `/setup`.

## API

Barcha yo'llar `/api/v1` prefiksi bilan. Javob formati: `{ success, data }` yoki `{ success: false, error: { code, message } }`.

### Ochiq (public)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/health`, `/health/ready`, `/health/live` | Holat tekshiruvi |
| POST | `/auth/telegram` | Mini App `initData` orqali kirish |
| GET | `/categories`, `/categories/:slug` | Kategoriyalar (LokmaGo'dan, kesh orqali) |
| GET | `/products`, `/products/:id` | Mahsulotlar (LokmaGo'dan; qidiruv, filtr, sahifalash) |
| GET | `/settings/banner` | Bosh sahifa banneri |
| GET/POST | `/delivery/zones`, `/delivery/quote` | Yetkazib berish narxi |
| GET | `/payments/providers` | To'lov provayderlari holati |

### Mijoz (JWT talab qilinadi)

| Metod | Yo'l |
|---|---|
| GET | `/auth/me` |
| GET/POST/PATCH/DELETE | `/cart`, `/cart/items`, `/cart/items/:id` |
| POST | `/orders` (savatdan), `/orders/quick` (bitta mahsulot) |
| GET | `/orders`, `/orders/:orderNumber` |

### Admin (JWT + rol ruxsati)

| Metod | Yo'l |
|---|---|
| POST | `/auth/admin/login` |
| GET | `/admin/products`, `/admin/categories` (faqat o'qish) |
| PUT/DELETE | `/admin/products/:id/category` (taomni kategoriyaga o'tkazish) |
| GET/PATCH | `/admin/orders`, `/admin/orders/:id` |
| GET | `/admin/customers`, `/admin/statistics/dashboard`, `/admin/statistics/overview` |
| GET/PUT | `/admin/settings/banner` |

## Buyurtma statuslari

```
NEW → CONFIRMED → PREPARING → READY → DELIVERING → COMPLETED
                                 └──────────────→ COMPLETED

COMPLETED va CANCELLED dan tashqari har qanday holatdan → CANCELLED
```

Noto'g'ri o'tish urinishi `VALIDATION_ERROR` qaytaradi (`order.transitions.ts`).

## Rollar

`SUPER_ADMIN`, `ADMIN`, `OPERATOR`, `CONTENT_MANAGER` — ruxsatlar `shared/permissions.ts` da.

## Qo'shimcha hujjatlar

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/auth.md`](docs/auth.md)
- [`docs/telegram.md`](docs/telegram.md)
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/BACKUP.md`](docs/BACKUP.md)
- [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)

## Xavfsizlik

`.env` faylini hech qachon commit qilmang. `JWT_SECRET` uchun kamida 32 belgili tasodifiy satr ishlating:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
