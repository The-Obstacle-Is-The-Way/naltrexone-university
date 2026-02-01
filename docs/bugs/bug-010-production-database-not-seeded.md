# BUG-010: Production Database Not Seeded — No Questions Available

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

---

## Description

After logging in and clicking "Get Started", users see no questions on the `/app/practice` page. The page shows "No more questions found" because the production database (Neon) has not been seeded with question content.

The codebase has 10 placeholder MDX question files in `content/questions/placeholder/`, but the `pnpm db:seed` command has never been run against the production database.

## Steps to Reproduce

1. Go to the production Vercel deployment
2. Sign in with Clerk
3. Subscribe (or bypass entitlement check)
4. Navigate to `/app/practice`
5. Observe: "No more questions found" instead of actual questions

## Expected Behavior

Users should see multiple-choice questions with stems, choices, and be able to submit answers.

## Root Cause

The production database (`DATABASE_URL` pointing to Neon) has no rows in the `questions` or `choices` tables. The seed script (`scripts/seed.ts`) reads MDX files from `content/questions/**/*.mdx` and inserts them into the database, but this has never been executed against production.

## Fix

Run the seed script against the production database:

```bash
# Option 1: Run locally with production DATABASE_URL
DATABASE_URL="<production-neon-url>" pnpm db:seed

# Option 2: Add a Vercel deployment hook or GitHub Action to seed on deploy
# (requires careful idempotency handling — seed script already supports this)
```

### Deployment Recommendation

Add seeding to the deployment pipeline:

1. **Vercel Build Command:** Change from `pnpm build` to `pnpm db:migrate && pnpm db:seed && pnpm build`
2. **Or:** Create a separate GitHub Action that runs `db:seed` after successful deploy
3. **Or:** Run manually once, then rely on idempotent updates

The seed script is already idempotent (skips unchanged questions, updates modified ones).

## Verification

- [ ] Run `pnpm db:seed` against production database
- [ ] Verify questions appear in `/app/practice`
- [ ] Verify submit/grading works correctly
- [ ] Add E2E test that verifies at least one question loads

## Impact

- **Severity:** P1 — Core product feature completely broken
- **Users Affected:** All users who subscribe
- **Revenue Impact:** Subscribers cannot access the product they paid for

## Related

- `scripts/seed.ts` — Seed script implementation
- `content/questions/placeholder/*.mdx` — 10 placeholder questions
- `app/(app)/app/practice/page.tsx` — Practice page that shows "No more questions found"
- SPEC-012: Core Question Loop (requires seeded data)
