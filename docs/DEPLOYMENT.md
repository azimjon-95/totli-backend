# Deploy — Contabo VPS

Backend Contabo VPS'da Docker orqali ishlaydi, frontend esa Vercel'da. VPS'dagi
Nginx faqat API uchun reverse proxy va TLS terminatsiyasi vazifasini bajaradi.

```
Telegram / brauzer
        │
        ├─ totli-web.vercel.app      (mijoz Mini App)      ─┐
        ├─ totli-admin.vercel.app    (admin panel)          │  HTTPS
        │                                                   │
        └─ api.sizning-domen.uz  →  Contabo VPS  ←──────────┘
                                      │
                                    Nginx (443)
                                      │  127.0.0.1:4000
                                    totli-api konteyneri
                                      │  ichki tarmoq
                                    mongodb · redis
```

Talab: Ubuntu 22.04 yoki 24.04 bo'lgan Contabo VPS (minimal VPS S ham yetadi),
API uchun domen (masalan `api.sizning-domen.uz`).

---

## 1. Serverni tayyorlash

Root sifatida kiring va avval oddiy foydalanuvchi yarating — root bilan ishlamang.

```bash
ssh root@<VPS_IP>

adduser totli
usermod -aG sudo totli
rsync --archive --chown=totli:totli ~/.ssh /home/totli/
```

SSH parol bilan kirishni o'chiring (Contabo standart holatda yoqib beradi):

```bash
sudo nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
sudo systemctl restart ssh
```

Yangi terminalda `ssh totli@<VPS_IP>` ishlashini tekshiring, **keyin** eskisini yoping.

## 2. Firewall

Contabo VPS'lari ochiq internetda turadi, shuning uchun bu bosqichni
o'tkazib yubormang.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

MongoDB (27017) va Redis (6379) portlari **hech qachon** ochilmasligi kerak.
`docker-compose.prod.yml` ularni umuman e'lon qilmaydi — konteynerlar bir-biri
bilan ichki tarmoq orqali gaplashadi.

> Diqqat: Docker `iptables` qoidalarini UFW'dan chetlab o'tishi mumkin. Shuning
> uchun prod compose faylida API porti ham `127.0.0.1:4000` ga bog'langan —
> tashqaridan faqat Nginx orqali kiriladi.

## 3. Docker o'rnatish

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

## 4. Loyihani olish

```bash
sudo mkdir -p /opt/totli && sudo chown $USER:$USER /opt/totli
git clone https://github.com/azimjon-95/totli-backend.git /opt/totli
cd /opt/totli
```

Private repo bo'lgani uchun deploy key ishlatish qulayroq:

```bash
ssh-keygen -t ed25519 -C "totli-vps" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# GitHub → repo → Settings → Deploy keys → Add deploy key (read-only)
```

## 5. `.env` to'ldirish

```bash
cp .env.example .env
nano .env
```

Parollarni qo'lda o'ylab topmang:

```bash
openssl rand -hex 32   # JWT_SECRET uchun
openssl rand -hex 24   # MONGO_ROOT_PASSWORD uchun
openssl rand -hex 24   # REDIS_PASSWORD uchun
```

Production uchun majburiy qiymatlar:

```ini
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

MONGO_ROOT_USER=totli
MONGO_ROOT_PASSWORD=<yuqoridagi parol>
REDIS_PASSWORD=<yuqoridagi parol>

# Host nomlari — konteyner nomlari, "localhost" emas
MONGODB_URI=mongodb://totli:<parol>@mongodb:27017/totli?authSource=admin
REDIS_URL=redis://:<parol>@redis:6379

JWT_SECRET=<64 belgili hex>

TELEGRAM_BOT_TOKEN=<BotFather'dan>
TELEGRAM_BOT_USERNAME=<bot username>
ADMIN_CHAT_ID=<guruh yoki shaxsiy chat id>

WEBAPP_URL=https://totli-web.vercel.app
ADMIN_URL=https://totli-admin.vercel.app
CORS_ORIGINS=https://totli-web.vercel.app,https://totli-admin.vercel.app
```

`CORS_ORIGINS` da domen aniq mos kelishi kerak — oxirida `/` bo'lmasin.

## 6. Ishga tushirish

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Birinchi marta admin va boshlang'ich ma'lumotlarni yarating:

```bash
# .env ga SEED_ADMIN_PASSWORD qo'shing, keyin:
docker compose -f docker-compose.prod.yml exec api node dist/scripts/seed.js
```

Tekshirish:

```bash
curl http://127.0.0.1:4000/api/v1/health
```

## 7. Nginx va TLS

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp docker/nginx.conf /etc/nginx/sites-available/totli-api
sudo nano /etc/nginx/sites-available/totli-api      # server_name ni yozing
sudo ln -s /etc/nginx/sites-available/totli-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.sizning-domen.uz
```

Certbot sertifikatni oladi va HTTPS blokini o'zi to'ldiradi. Yangilanish
`systemd` taymeri orqali avtomatik ishlaydi:

```bash
sudo systemctl status certbot.timer
```

DNS: Contabo panelida yoki domen provayderingizda `api` uchun **A record**
yarating va VPS IP manziliga yo'naltiring.

## 8. Frontendni ulash

Vercel'dagi ikkala loyihada Settings → Environment Variables:

```
VITE_API_URL = https://api.sizning-domen.uz/api
```

Keyin ikkala loyihani ham qayta deploy qiling (Deployments → Redeploy).

## 9. Telegram

```bash
# WEBAPP_URL to'g'ri ekaniga ishonch hosil qiling, keyin botni qayta ishga tushiring
docker compose -f docker-compose.prod.yml restart api
```

BotFather'da `/newapp` orqali Mini App URL sifatida `https://totli-web.vercel.app`
ni ko'rsating.

---

## Yangilash

```bash
cd /opt/totli
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```

## Zaxira nusxa

`./backups` papkasi mongodb konteyneriga ulangan.

```bash
docker compose -f docker-compose.prod.yml exec mongodb \
  mongodump --username=$MONGO_ROOT_USER --password=$MONGO_ROOT_PASSWORD \
  --authenticationDatabase=admin --db=totli --out=/backups/$(date +%F)
```

Har kuni avtomatik bajarish uchun cron:

```bash
crontab -e
# 0 3 * * * cd /opt/totli && ./scripts/backup.sh >> /var/log/totli-backup.log 2>&1
```

Batafsil: [`BACKUP.md`](BACKUP.md).

## Loglar va diagnostika

```bash
docker compose -f docker-compose.prod.yml logs -f api      # API loglari
docker compose -f docker-compose.prod.yml ps               # konteynerlar holati
sudo tail -f /var/log/nginx/error.log                      # Nginx xatolari
curl -s https://api.sizning-domen.uz/api/v1/health | jq    # tashqaridan tekshirish
```

Log fayllari `json-file` drayveri bilan cheklangan (10 MB × 5), shuning uchun
diskni to'ldirib yubormaydi.

---

## Xavfsizlik eslatmalari

- `.env` faylini hech qachon commit qilmang — `.gitignore` da bor, shundayligicha qoldiring
- `JWT_SECRET` ni almashtirsangiz, barcha mavjud sessiyalar bekor bo'ladi
- Mongo va Redis portlarini tashqariga ochmang, ular allaqachon parol bilan himoyalangan
- Admin panel ochiq internetda — Vercel tomonda qo'shimcha himoya (Vercel
  Authentication yoki parol) qo'yishni ko'rib chiqing
- `sudo unattended-upgrades` ni yoqib qo'ying, xavfsizlik yangilanishlari avtomatik o'rnatiladi
