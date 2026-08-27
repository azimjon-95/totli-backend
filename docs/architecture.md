# TOTLI Architecture

## Overview

Telegram Commerce Platform for cakes and sweets (TOTLI).

```
Telegram Group
    ↓
Telegram Bot
    ↓
Telegram Mini App (apps/web)
    ↓
Backend API (server)
    ↓
MongoDB + Redis
    ↓
Admin Panel (apps/admin) + Admin Telegram notifications
```

## Monorepo

- `apps/web` — Customer Telegram Mini App
- `apps/admin` — Admin dashboard
- `server` — Node.js API + Bot
- `packages/types` — Shared TypeScript types
- `packages/shared` — Shared constants & utilities

## Data flow

All data flows through the backend API. Frontend never talks to MongoDB/Redis directly.

Auth is based on Telegram WebApp `initData` verification on the server.
