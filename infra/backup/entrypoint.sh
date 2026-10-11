#!/bin/sh
# Install cron schedule and wait
set -e

# Write crontab from env
echo "${BACKUP_SCHEDULE:-0 2 * * *} /backup.sh >> /var/log/backup.log 2>&1" | crontab -

echo "[$(date)] DB backup scheduler started — schedule: ${BACKUP_SCHEDULE:-0 2 * * *}"

# Run first backup immediately on start
/backup.sh

# Start crond in foreground
exec crond -f -d 8
