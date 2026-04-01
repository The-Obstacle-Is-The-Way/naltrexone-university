#!/bin/bash
set -euo pipefail

# Corpus Seeding Pipeline
# Imports draft questions and seeds all Neon environments.
# Usage: pnpm db:seed:all
#
# Prerequisites:
#   - Draft questions in content/drafts/questions/
#   - .env.local with dev/preview DATABASE_URL
#   - Vercel CLI authenticated (for production URL pull)

echo "=== Step 1: Clear stale imported files ==="
rm -rf content/questions/imported/*

echo "=== Step 2: Import drafts as published ==="
pnpm content:import:drafts -- --status published

echo "=== Step 3: Dry-run validation ==="
pnpm content:import:drafts -- --dry-run

echo "=== Step 4: Seed dev/preview (from .env.local) ==="
pnpm db:seed

echo "=== Step 5: Seed production (pulling URL from Vercel) ==="
PROD_DB=$(npx vercel env pull /dev/stdout --environment=production 2>/dev/null \
  | grep DATABASE_URL | cut -d'"' -f2)

if [ -z "$PROD_DB" ]; then
  echo "ERROR: Could not pull production DATABASE_URL from Vercel."
  echo "Ensure you are authenticated: npx vercel login"
  exit 1
fi

DATABASE_URL="$PROD_DB" pnpm db:seed

echo "=== Done: All environments seeded ==="
