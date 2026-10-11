#!/bin/sh
# Daily PostgreSQL backup → MinIO
# Runs inside db-backup container via cron

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/ptaas_backup_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."

# Read secrets
PGPASSWORD=$(cat /run/secrets/db_password)
MINIO_SECRET_KEY=$(cat /run/secrets/minio_root_password)

export PGPASSWORD

# Dump
pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" \
  --no-owner --no-acl --compress=9 \
  -f "$BACKUP_FILE"

echo "[$(date)] Dump complete: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Upload to MinIO using curl (no mc binary needed)
MINIO_BUCKET="ptaas-backups"
MINIO_KEY="backups/${TIMESTAMP}/ptaas_db.sql.gz"

# MinIO PUT via presigned-compatible upload
curl -sf \
  --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
  --aws-sigv4 "aws:amz:us-east-1:s3" \
  -T "$BACKUP_FILE" \
  "${MINIO_ENDPOINT}/${MINIO_BUCKET}/${MINIO_KEY}"

echo "[$(date)] Uploaded to minio://${MINIO_BUCKET}/${MINIO_KEY}"

# Cleanup local dump
rm -f "$BACKUP_FILE"

# Prune old backups (list objects, delete those older than BACKUP_RETENTION_DAYS)
CUTOFF=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v "-${BACKUP_RETENTION_DAYS}d" +%Y%m%d)
echo "[$(date)] Pruning backups older than ${BACKUP_RETENTION_DAYS} days (before ${CUTOFF})"

curl -sf \
  --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
  --aws-sigv4 "aws:amz:us-east-1:s3" \
  "${MINIO_ENDPOINT}/${MINIO_BUCKET}?list-type=2&prefix=backups/" \
  | grep -oP '(?<=<Key>)[^<]+' \
  | while read -r key; do
      # Extract date portion from key: backups/YYYYMMDD_HHMMSS/...
      KEY_DATE=$(echo "$key" | grep -oP '\d{8}(?=_)' | head -1)
      if [ -n "$KEY_DATE" ] && [ "$KEY_DATE" -lt "$CUTOFF" ]; then
        echo "[$(date)] Deleting old backup: $key"
        curl -sf \
          --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
          --aws-sigv4 "aws:amz:us-east-1:s3" \
          -X DELETE \
          "${MINIO_ENDPOINT}/${MINIO_BUCKET}/${key}"
      fi
    done

echo "[$(date)] Backup complete."
