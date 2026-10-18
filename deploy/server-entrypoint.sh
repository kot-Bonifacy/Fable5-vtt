#!/bin/sh
# Start order from stage 28: rulebook data first, then migrations, then the server.
set -eu

private_cpred="${DATA_PRIVATE_DIR:-/data/private}/cpred"
if [ ! -f "$private_cpred/skills.json" ] && [ "${VTT_ALLOW_SAMPLE_DATA:-0}" != "1" ]; then
  echo "vtt: $private_cpred/skills.json is missing — refusing to start on the repo samples" >&2
  echo "vtt: copy data/private/cpred to the host (docs/DEPLOY.md) or set VTT_ALLOW_SAMPLE_DATA=1" >&2
  exit 1
fi

# No database next to campaign uploads means a lost or misplaced vtt.db, not a
# first start: a fresh base would make uploads-gc delete every file over an hour old.
db_file="${DATABASE_URL#file:}"
if [ ! -s "$db_file" ] && [ -n "$(find "${UPLOADS_DIR:-/data/uploads}/campaigns" -type f 2>/dev/null | head -n 1)" ] \
  && [ "${VTT_ALLOW_EMPTY_DB:-0}" != "1" ]; then
  echo "vtt: $db_file is missing but uploads/campaigns has files — refusing to start on an empty database" >&2
  echo "vtt: put the database back (docs/DEPLOY.md) or set VTT_ALLOW_EMPTY_DB=1" >&2
  exit 1
fi

node node_modules/prisma/build/index.js migrate deploy
exec node dist/main.js
