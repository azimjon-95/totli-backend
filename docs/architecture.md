# TOTLI Architecture

## Overview

Telegram Commerce Platform for cakes and sweets (TOTLI).

```
Telegram Group
    ↓
Telegram Bot
    ↓
Telegram Mini App (totli-frontend)
    ↓
Backend API (server)
    ↓
MongoDB + Redis
    ↓
Admin Panel (totli-frontend, admin domenida) + Admin Telegram notifications
```

## Repolar

- `totli-backend` (shu repo) — Node.js API + Telegram bot, Contabo VPS'da Docker orqali
- `totli-frontend` — mijoz Mini App va admin panel bitta React ilovasida, Vercel'da
  ikkita loyiha sifatida deploy qilinadi (rejim domen nomidan aniqlanadi)

## Data flow

All data flows through the backend API. Frontend never talks to MongoDB/Redis directly.

Auth is based on Telegram WebApp `initData` verification on the server.
