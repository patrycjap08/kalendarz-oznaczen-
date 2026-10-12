#!/usr/bin/env bash
set -euo pipefail
# Run only in a trusted backup environment with protected PostgreSQL/AWS credentials.
: "${BACKUP_AGE_RECIPIENT:?Missing public age recipient}"
: "${BACKUP_S3_PREFIX:?Missing private bucket prefix}"
: "${PGHOST:?Missing database host}"
: "${PGUSER:?Missing database user}"
: "${PGPASSWORD:?Missing database password}"
: "${PGDATABASE:?Missing database name}"
: "${PGSSLROOTCERT:?Missing trusted database certificate}"
export PGSSLMODE=verify-full
for task_tool in pg_dump pg_restore age aws rg; do command -v "$task_tool" >/dev/null; done
task_backup_dir=$(mktemp -d)
trap 'rm -rf "$task_backup_dir"' EXIT
chmod 700 "$task_backup_dir"
pg_dump --format=custom --no-owner --file="$task_backup_dir/calendar.dump"
pg_restore --list "$task_backup_dir/calendar.dump" > "$task_backup_dir/objects.txt"
rg 'auth users' "$task_backup_dir/objects.txt" >/dev/null
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$task_backup_dir/calendar.dump.age" "$task_backup_dir/calendar.dump"
task_backup_name=$(date -u +%Y-%m-%dT%H-%M-%SZ)
aws s3 cp "$task_backup_dir/calendar.dump.age" "${BACKUP_S3_PREFIX%/}/$task_backup_name.dump.age" --sse AES256 --only-show-errors
echo "Encrypted full database backup uploaded successfully: $task_backup_name"
