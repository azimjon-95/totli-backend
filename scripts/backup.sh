#!/usr/bin/env bash
# Kunlik MongoDB zaxira nusxasi. Cron orqali ishlatiladi:
#   0 3 * * * cd /opt/totli && ./scripts/backup.sh >> /var/log/totli-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; source .env; set +a

COMPOSE="docker compose -f docker-compose.prod.yml"
STAMP="$(date +%F-%H%M)"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

echo "[$(date -Is)] backup boshlandi: $STAMP"

$COMPOSE exec -T mongodb mongodump \
  --username="$MONGO_ROOT_USER" \
  --password="$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase=admin \
  --db=totli \
  --archive="/backups/totli-$STAMP.archive" \
  --gzip

# Eski nusxalarni tozalash
find ./backups -name 'totli-*.archive' -mtime "+$KEEP_DAYS" -delete

echo "[$(date -Is)] backup tugadi: totli-$STAMP.archive"
