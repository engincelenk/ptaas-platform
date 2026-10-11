#!/usr/bin/env bash
# PostgreSQL daily backup → MinIO ptaas-backups bucket.
# Runs as a Docker one-shot container on the `internal` network.
# Retention: deletes backups older than 30 days from MinIO.
#
# Required environment variables:
#   POSTGRES_HOST, POSTGRES_USER, POSTGRES_DB, PGPASSWORD
#   MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET (default: ptaas-backups)

set -euo pipefail

BUCKET="${MINIO_BUCKET:-ptaas-backups}"
DATE=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
FILENAME="ptaas-${DATE}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[backup] Starting PostgreSQL backup: ${FILENAME}"

# Dump + compress
PGPASSWORD="${PGPASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  "${POSTGRES_DB}" \
  | gzip -9 > "${TMPFILE}"

FILESIZE=$(du -sh "${TMPFILE}" | cut -f1)
echo "[backup] Dump complete — size: ${FILESIZE}"

# Upload to MinIO
mc alias set minio "http://${MINIO_ENDPOINT}:9000" \
  "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --quiet

mc mb --ignore-existing "minio/${BUCKET}"
mc cp "${TMPFILE}" "minio/${BUCKET}/${FILENAME}"

echo "[backup] Upload complete: s3://${BUCKET}/${FILENAME}"

# Retention — delete backups older than 30 days
CUTOFF=$(date -u -d '30 days ago' +"%Y-%m-%dT%H-%M-%SZ" 2>/dev/null \
  || date -u -v-30d +"%Y-%m-%dT%H-%M-%SZ")

echo "[backup] Applying 30-day retention..."
mc ls "minio/${BUCKET}" --json \
  | jq -r 'select(.lastModified < "'"${CUTOFF}"'") | .key' \
  | while read -r key; do
      echo "[backup] Removing expired backup: ${key}"
      mc rm "minio/${BUCKET}/${key}"
    done

rm -f "${TMPFILE}"
echo "[backup] Done."
