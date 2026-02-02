# DEBT-061: Timezone Not Explicitly Enforced at Application Level

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The schema uses `timestamp(..., { withTimezone: true }).defaultNow()`, but we did not explicitly set the Postgres session timezone. While `timestamptz` is stored in UTC, setting an explicit timezone reduces ambiguity and prevents environment-dependent surprises when rendering or comparing dates.

## Fix

- Enforced UTC at the database session level by setting `TimeZone = 'UTC'` on the Postgres client connection parameters.
- Centralized the setting in `lib/db-connection-options.ts` and reused it in `lib/db.ts`.

## Verification

- [x] Unit test added: `lib/db-connection-options.test.ts`
- [ ] Manual: confirm timestamps read/write consistently across local and production environments

