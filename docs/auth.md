# Authentication

## Customer (Telegram Mini App)

1. Mini App sends `POST /api/v1/auth/telegram` with `{ "initData": "<Telegram.WebApp.initData>" }`.
2. Server validates HMAC-SHA256 signature using bot token (official Telegram algorithm).
3. Checks `auth_date` against `TELEGRAM_AUTH_MAX_AGE_SEC`.
4. Upserts User by verified `telegramId`.
5. Returns JWT access token (`type: customer`).

Never trust client-sent telegramId without initData validation.

## Admin

1. `POST /api/v1/auth/admin/login` with `{ "login": "email|username", "password": "..." }`.
2. bcrypt password verify.
3. Returns JWT (`type: admin`) with role.

## Middleware

- `requireCustomerAuth` — only customer JWT
- `requireAdminAuth` — only admin JWT  
- `requirePermission('orders:status', ...)` — RBAC

Customer and admin tokens are not interchangeable.
