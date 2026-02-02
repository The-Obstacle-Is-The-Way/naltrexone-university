# BUG-010: Database Not Seeded — No Questions Available

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-01

---

## Description

If the database has not been seeded with question content, users will see no questions on the `/app/practice` page. The page shows "No more questions found" because there are zero published questions available.

This can happen in any environment (local, staging, production) where migrations ran but seeding did not.

## Steps to Reproduce

1. Start with an empty Postgres database (migrations applied)
2. Do **not** run `pnpm db:seed`
3. Sign in with Clerk (or set `NEXT_PUBLIC_SKIP_CLERK=true` for local testing)
4. Navigate to `/app/practice`
5. Observe: "No more questions found" instead of actual questions

## Expected Behavior

Users should see multiple-choice questions with stems and choices, and be able to submit answers.

## Root Cause

The database has no rows in the `questions` and `choices` tables. The seed script (`scripts/seed.ts`) reads MDX files from `content/questions/**/*.mdx` and inserts them into the database.

## Fix

Run the seed script against the target database:

```bash
# Option 1: Run locally against the target DATABASE_URL
DATABASE_URL="<target-database-url>" pnpm db:seed

# Option 2: Add a Vercel deployment hook or GitHub Action to seed on deploy
# (requires careful idempotency handling — seed script already supports this)
```

### Deployment Recommendation

Treat seeding as an explicit release step:

1. Run `pnpm db:migrate` and `pnpm db:seed` once per environment setup (or when content is updated).
2. Prefer a manual/controlled trigger (runbook, GitHub Action workflow_dispatch) over seeding on every deploy.

The seed script is intended to be idempotent, but it still writes to the database, so it should run under a controlled process.

## Verification

- [ ] Run `pnpm db:seed` against the target database
- [ ] Verify questions appear on `/app/practice`
- [ ] Verify submit/grading works correctly
- [ ] Add E2E test that verifies at least one question loads (requires seeded data)

## Impact

- **Severity:** P1 — Core product feature completely broken
- **Users Affected:** All users in unseeded environments
- **Revenue Impact:** Subscribers cannot access the product they paid for

## Related

- `scripts/seed.ts` — Seed script implementation
- `content/questions/**` — Question content (MDX)
- `app/(app)/app/practice/page.tsx` — Practice page that shows "No more questions found"
- SPEC-012: Core Question Loop (requires seeded data)
