# MongoDB Backup Strategy

## Daily dump (example)

```bash
# Cron: 0 3 * * *
mongodump --uri="$MONGODB_URI" --out=/backups/totli-$(date +%F)
# Keep 14 days
find /backups -type d -name 'totli-*' -mtime +14 -exec rm -rf {} +
```

## Restore

```bash
mongorestore --uri="$MONGODB_URI" --drop /backups/totli-YYYY-MM-DD
```

## Notes

- Prefer managed MongoDB (Atlas) automated backups in production.
- Test restore quarterly.
- Never put backup files in the application Docker image.
