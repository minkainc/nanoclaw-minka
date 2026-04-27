#!/bin/bash
# Daily SQLite backup — called from cron
# Creates a local backup and optionally uploads to GCS
set -euo pipefail

DB_PATH="/mnt/data/nanoclaw/store/messages.db"
BACKUP_DIR="/mnt/data/backups"
DATE=$(date +%Y%m%d)
BACKUP_FILE="$BACKUP_DIR/messages-${DATE}.db"

# Skip if database doesn't exist yet
if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH, skipping backup"
  exit 0
fi

# Create backup using SQLite's .backup command (safe, consistent snapshot)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backup created: $BACKUP_FILE"

# Rotate local backups — keep last 7 days
find "$BACKUP_DIR" -name "messages-*.db" -mtime +7 -delete
echo "Old local backups cleaned up"

# Weekly GCS upload (Sundays only)
if [ "$(date +%u)" -eq 7 ]; then
  PROJECT=$(curl -s -H "Metadata-Flavor: Google" \
    http://metadata.google.internal/computeMetadata/v1/project/project-id)
  BUCKET="gs://${PROJECT}-backups/sqlite/"

  # Check if bucket exists before uploading
  if gsutil ls "$BUCKET" > /dev/null 2>&1; then
    gsutil cp "$BACKUP_FILE" "$BUCKET"
    echo "Weekly backup uploaded to $BUCKET"

    # Retain 4 weekly backups in GCS
    gsutil ls "$BUCKET" | sort | head -n -4 | xargs -r gsutil rm
    echo "Old GCS backups cleaned up"
  else
    echo "Warning: GCS bucket $BUCKET not found, skipping upload"
  fi
fi
