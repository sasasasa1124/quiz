#!/bin/sh
# Apply all D1 migrations in order.
# Usage: scripts/migrate-d1.sh [--local]

FLAG=""
if [ "$1" = "--local" ]; then
  FLAG="--local"
fi

DIR="$(cd "$(dirname "$0")/../migrations" && pwd)"

for f in $(ls "$DIR"/*.sql | sort); do
  echo "[migrate-d1] Running $(basename "$f")..."
  npx wrangler d1 execute quiz-db $FLAG --file="$f"
done

echo "[migrate-d1] Done."
