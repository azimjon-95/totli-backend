# Deployment (VPS example)

1. Install Node 20+, Docker, Nginx
2. Clone repo (without committing `.env`)
3. `cp .env.example .env` and fill secrets
4. `docker compose up -d` (Mongo + Redis) or use managed DB
5. `npm ci && npm run build`
6. `npm run seed` only for first admin (dev/staging)
7. Process manager: `npm run start` or PM2:
   ```bash
   pm2 start server/dist/index.js --name totli-api
   ```
8. Point Nginx to API + static builds (`docker/nginx.conf` as reference)
9. Set `WEBAPP_URL`, `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID`
10. Bot long-polls by default; production may set `TELEGRAM_WEBHOOK_URL`

Never put real tokens in git or release ZIP.
