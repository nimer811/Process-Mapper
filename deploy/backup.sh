#!/usr/bin/env bash
# Nightly database backup (install.sh schedules it at 02:30): keeps the last 14 days in backups/.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
file="backups/process-ai-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U process_ai -d process_ai | gzip > "$file"
find backups -name 'process-ai-*.sql.gz' -mtime +14 -delete
echo "Backup written: $file"
