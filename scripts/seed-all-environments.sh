#!/bin/bash
set -euo pipefail

# Corpus Seeding Pipeline
# Imports draft questions and seeds each unique database target across:
# - local (.env.local)
# - Vercel Development
# - Vercel Preview
# - Vercel Production
#
# Usage:
#   pnpm db:seed:all
#   pnpm db:seed:all -- --plan
#
# Notes:
# - Vercel env values are pulled into temp files only and never committed.
# - Identical DATABASE_URL values are deduplicated so a shared non-production DB
#   is seeded once even if local/development/preview point at the same host.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLAN_ONLY=false

if [ "${1:-}" = "--plan" ]; then
  PLAN_ONLY=true
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$PROJECT_ROOT"

read_env_var() {
  local file_path="$1"
  local var_name="$2"

  node - "$file_path" "$var_name" <<'NODE'
const fs = require('node:fs');

const filePath = process.argv[2];
const varName = process.argv[3];
const source = fs.readFileSync(filePath, 'utf8');
const lines = source.split(/\r?\n/);

for (const line of lines) {
  if (!line.startsWith(`${varName}=`)) continue;

  let value = line.slice(varName.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  process.stdout.write(value);
  process.exit(0);
}
NODE
}

summarize_database_url() {
  local url="$1"

  node - "$url" <<'NODE'
const rawUrl = process.argv[2];
const parsed = new URL(rawUrl);
const databaseName = parsed.pathname.replace(/^\//, '');
process.stdout.write(`${parsed.host}/${databaseName}`);
NODE
}

database_target_key() {
  summarize_database_url "$1"
}

require_non_empty() {
  local label="$1"
  local value="$2"

  if [ -z "$value" ]; then
    echo "ERROR: Missing required value for $label" >&2
    exit 1
  fi
}

declare -a TARGET_URLS=()
declare -a TARGET_LABELS=()
declare -a TARGET_KEYS=()

add_target() {
  local label="$1"
  local url="$2"
  local key
  key="$(database_target_key "$url")"

  for index in "${!TARGET_KEYS[@]}"; do
    if [ "${TARGET_KEYS[$index]}" = "$key" ]; then
      TARGET_LABELS[$index]="${TARGET_LABELS[$index]}, $label"
      return
    fi
  done

  TARGET_KEYS+=("$key")
  TARGET_URLS+=("$url")
  TARGET_LABELS+=("$label")
}

echo "=== Pulling Vercel environment files into temp workspace ==="
npx vercel env pull "$TMP_DIR/development.env" --environment=development >/dev/null
npx vercel env pull "$TMP_DIR/preview.env" --environment=preview >/dev/null
npx vercel env pull "$TMP_DIR/production.env" --environment=production >/dev/null

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Local seeding requires a local DATABASE_URL." >&2
  exit 1
fi

LOCAL_DB_URL="$(read_env_var .env.local DATABASE_URL)"
DEV_DB_URL="$(read_env_var "$TMP_DIR/development.env" DATABASE_URL)"
PREVIEW_DB_URL="$(read_env_var "$TMP_DIR/preview.env" DATABASE_URL)"
PROD_DB_URL="$(read_env_var "$TMP_DIR/production.env" DATABASE_URL)"

require_non_empty "local .env.local DATABASE_URL" "$LOCAL_DB_URL"
require_non_empty "Vercel Development DATABASE_URL" "$DEV_DB_URL"
require_non_empty "Vercel Preview DATABASE_URL" "$PREVIEW_DB_URL"
require_non_empty "Vercel Production DATABASE_URL" "$PROD_DB_URL"

LOCAL_DB_KEY="$(database_target_key "$LOCAL_DB_URL")"
DEV_DB_KEY="$(database_target_key "$DEV_DB_URL")"
PREVIEW_DB_KEY="$(database_target_key "$PREVIEW_DB_URL")"
PROD_DB_KEY="$(database_target_key "$PROD_DB_URL")"

if [ "$PROD_DB_KEY" = "$LOCAL_DB_KEY" ] || [ "$PROD_DB_KEY" = "$DEV_DB_KEY" ] || [ "$PROD_DB_KEY" = "$PREVIEW_DB_KEY" ]; then
  echo "ERROR: Production DATABASE_URL matches a non-production target. Refusing to seed." >&2
  exit 1
fi

add_target "local (.env.local)" "$LOCAL_DB_URL"
add_target "Vercel development" "$DEV_DB_URL"
add_target "Vercel preview" "$PREVIEW_DB_URL"
add_target "Vercel production" "$PROD_DB_URL"

echo "=== Seed target plan ==="
for index in "${!TARGET_URLS[@]}"; do
  echo "- ${TARGET_LABELS[$index]} -> ${TARGET_KEYS[$index]}"
done

if [ "$PLAN_ONLY" = "true" ]; then
  echo "=== Plan complete (no imports or seeds run) ==="
  exit 0
fi

echo "=== Step 1: Dry-run validation (published import mode) ==="
pnpm content:import:drafts -- --status published --dry-run

echo "=== Step 2: Clear stale imported files ==="
rm -rf content/questions/imported/*

echo "=== Step 3: Import drafts as published ==="
pnpm content:import:drafts -- --status published

for index in "${!TARGET_URLS[@]}"; do
  echo "=== Step $((index + 4)): Seed ${TARGET_LABELS[$index]} ==="
  DATABASE_URL="${TARGET_URLS[$index]}" pnpm db:seed
done

echo "=== Done: Seeded all unique environment targets ==="
