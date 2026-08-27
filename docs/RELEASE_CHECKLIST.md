# TOTLI v1.0.0 Release Checklist

## Core product
- [ ] Customer Mini App routes load
- [ ] Telegram Auth (initData HMAC)
- [ ] Telegram Bot /start + WebApp button
- [ ] Group pinned WebApp message
- [ ] Products / Categories API + Admin CRUD
- [ ] Cart (server prices)
- [ ] Checkout + order number + snapshot
- [ ] Admin order status transitions
- [ ] Customer Telegram notifications
- [ ] Admin Telegram new-order message + callbacks

## Hardening
- [ ] Rate limiting on auth/orders
- [ ] Order idempotencyKey
- [ ] Request ID on errors
- [ ] Health / ready / live
- [ ] No secrets in frontend bundle
- [ ] .env not in git/ZIP

## Optional / external
- [ ] CLICK / PAYME / PAYNET credentials (NOT_CONFIGURED until set)
- [ ] Production Telegram webhook URL
- [ ] HTTPS + Nginx
- [ ] Mongo daily backup cron

## Commands before release
```bash
npm install
npm run typecheck
npm run test
npm run build
```
