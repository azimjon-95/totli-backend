# Telegram Integration

## Bot permissions (Group)

Bot group admin bo'lishi kerak, kamida:
- Send messages
- Pin messages
- Delete messages (ixtiyoriy)

## Setup

1. @BotFather dan bot yarating, token oling → `TELEGRAM_BOT_TOKEN`
2. Mini App URL → `WEBAPP_URL`
3. Group ID → `TELEGRAM_GROUP_ID` (botni guruhga qo'shing)
4. Admin notifications chat → `ADMIN_CHAT_ID` (shaxsiy yoki guruh)
5. Admin Telegram ID ni seed qiling:
   ```bash
   SEED_ADMIN_TELEGRAM_ID=123456789 npm run seed
   ```

## Commands

| Command | Kim | Tavsif |
|---------|-----|--------|
| `/start` | hammasi | Welcome + WebApp button |
| `/orders` | admin | Faol buyurtmalar |
| `/today` | admin | Bugungi statistika |
| `/setup` | admin | Group pin xabarini qayta o'rnatish |

## Modes

- **Development**: long polling
- **Production**: `TELEGRAM_WEBHOOK_URL` o'rnatilsa webhook

Bir vaqtda ikkala mode ishlamasin.

## Deep links

```
https://t.me/YourBot/app?startapp=product_<id>
https://t.me/YourBot/app?startapp=category_<slug>
https://t.me/YourBot/app?startapp=new
```
